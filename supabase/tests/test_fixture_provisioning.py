"""Exercise local fixture Storage provisioning without contacting a running stack."""

from io import BytesIO
from contextlib import ExitStack
import json
import os
from pathlib import Path
import runpy
import sys
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fixture_provisioning import FixtureObject, ensure_fixture_object


def storage_error(status, payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return HTTPError("http://storage.invalid/object", status, "Failure", {}, BytesIO(body))


class FixtureProvisioningTests(unittest.TestCase):
    def provision(self, open_url):
        return ensure_fixture_object(
            "http://storage.invalid", "test-public-key", "test-service-key",
            "internal-assets", "project/design.png", b"canonical image", "image/png",
            open_url=open_url,
        )

    def test_preserves_existing_photograph_without_uploading(self):
        open_url = Mock(return_value=BytesIO(b"photographic overlay"))

        result = self.provision(open_url)

        self.assertEqual(result.content, b"photographic overlay")
        self.assertFalse(result.created)
        self.assertEqual(open_url.call_count, 1)
        self.assertEqual(open_url.call_args.args[0].get_method(), "GET")

    def test_preserves_existing_empty_object(self):
        open_url = Mock(return_value=BytesIO(b""))

        result = self.provision(open_url)

        self.assertEqual(result.content, b"")
        self.assertFalse(result.created)
        self.assertEqual(open_url.call_count, 1)

    def test_creates_only_a_confirmed_missing_object_without_upsert(self):
        for status, payload in [
            (404, {"code": "NoSuchKey"}),
            (400, {"statusCode": "404", "error": "not_found", "message": "Object not found"}),
        ]:
            with self.subTest(status=status, payload=payload):
                open_url = Mock(side_effect=[storage_error(status, payload), BytesIO(b'{}')])

                result = self.provision(open_url)

                self.assertEqual(result.content, b"canonical image")
                self.assertTrue(result.created)
                self.assertEqual(open_url.call_count, 2)
                upload = open_url.call_args.args[0]
                self.assertEqual(upload.get_method(), "POST")
                self.assertEqual(upload.data, b"canonical image")
                self.assertEqual(upload.get_header("X-upsert"), "false")
                self.assertEqual(upload.get_header("Content-type"), "image/png")

    def test_does_not_upload_on_auth_service_or_unknown_read_errors(self):
        cases = [
            (400, {"code": "InvalidJWT"}),
            (401, {"message": "Unauthorized"}),
            (403, {"code": "AccessDenied"}),
            (404, {"code": "NoSuchBucket"}),
            (404, {"message": "Not found"}),
            (400, {"code": "InvalidRequest", "error": "not_found", "message": "Object not found"}),
            (404, b"not json"),
            (404, []),
            (500, {"code": "NoSuchKey"}),
        ]
        for status, payload in cases:
            with self.subTest(status=status, payload=payload):
                open_url = Mock(side_effect=storage_error(status, payload))

                with self.assertRaisesRegex(RuntimeError, f"HTTP {status}"):
                    self.provision(open_url)

                self.assertEqual(open_url.call_count, 1)

    def test_does_not_swallow_transport_failure_or_timeout(self):
        for error in [URLError("connection refused"), TimeoutError("read timed out")]:
            with self.subTest(error=type(error).__name__):
                open_url = Mock(side_effect=error)

                with self.assertRaisesRegex(RuntimeError, "transport failed"):
                    self.provision(open_url)

                self.assertEqual(open_url.call_count, 1)

    def test_preserves_the_winner_of_a_concurrent_create(self):
        for status, payload in [
            (409, {"code": "ResourceAlreadyExists"}),
            (409, {"code": "KeyAlreadyExists"}),
            (400, {"statusCode": "409", "error": "Duplicate", "message": "The resource already exists"}),
        ]:
            with self.subTest(status=status, payload=payload):
                open_url = Mock(side_effect=[
                    storage_error(404, {"code": "NoSuchKey"}),
                    storage_error(status, payload),
                    BytesIO(b"concurrent photograph"),
                ])

                result = self.provision(open_url)

                self.assertEqual(result.content, b"concurrent photograph")
                self.assertFalse(result.created)
                self.assertEqual([call.args[0].get_method() for call in open_url.call_args_list], ["GET", "POST", "GET"])
                self.assertEqual(open_url.call_args_list[1].args[0].get_header("X-upsert"), "false")

    def test_duplicate_create_does_not_hide_failed_readback(self):
        open_url = Mock(side_effect=[
            storage_error(404, {"code": "NoSuchKey"}),
            storage_error(409, {"code": "ResourceAlreadyExists"}),
            storage_error(403, {"code": "AccessDenied"}),
        ])

        with self.assertRaisesRegex(RuntimeError, "GET failed.*HTTP 403"):
            self.provision(open_url)

        self.assertEqual(open_url.call_count, 3)

    def test_upload_errors_are_not_treated_as_duplicate_creates(self):
        for status, payload in [
            (403, {"code": "AccessDenied"}),
            (409, {"code": "TransactionError"}),
            (409, {"message": "The resource already exists"}),
            (500, {"code": "InternalError"}),
        ]:
            with self.subTest(status=status, payload=payload):
                open_url = Mock(side_effect=[
                    storage_error(404, {"code": "NoSuchKey"}),
                    storage_error(status, payload),
                ])

                with self.assertRaisesRegex(RuntimeError, f"POST failed.*HTTP {status}"):
                    self.provision(open_url)

                self.assertEqual(open_url.call_count, 2)

    def test_failure_does_not_echo_response_body_or_credentials(self):
        open_url = Mock(side_effect=storage_error(403, {"message": "test-service-key"}))

        with self.assertRaises(RuntimeError) as raised:
            self.provision(open_url)

        self.assertNotIn("test-service-key", str(raised.exception))
        self.assertNotIn("test-public-key", str(raised.exception))


class CoverProvisioningTests(unittest.TestCase):
    """Run provision_local_auth.py with isolated REST, media worker, credentials and file writes."""

    def run_provisioning(self, *, in_dataset=True, has_cover=False, has_version=False):
        root = Path(__file__).resolve().parents[2]
        fixture = {
            "users": [{"role": "agency", "id": "agency", "email": "agency@example.invalid"}],
            "delivery_project_id": "delivered-project",
            "covers": [{"project_id": "project", "index": 1, "width": 2, "height": 3, "client_visible": False}],
        }
        prepared = []

        def respond(request, timeout):
            url = request.full_url
            if url.startswith("http://127.0.0.1:55430/"):
                prepared.append({"url": url, "body": request.data, "auth": request.get_header("Authorization"),
                                 "type": request.get_header("Content-type")})
                return BytesIO(json.dumps({"path": "project/cover.png"}).encode())
            path = url.removeprefix("http://127.0.0.1:55421")
            if path.startswith("/auth/v1/token"):
                response = {"access_token": "agency-session"}
            elif path.startswith("/rest/v1/projects?select=id&id=eq.project"):
                response = [{"id": "project"}] if in_dataset else []
            elif path.startswith("/rest/v1/project_covers?"):
                response = [{"project_id": "project"}] if has_cover else []
            elif path.startswith("/rest/v1/published_versions?"):
                response = [{"id": "version"}] if has_version else []
            elif path.startswith("/rest/v1/delivery_files?"):
                response = [{"id": "existing-delivery"}]
            elif path.startswith("/rest/v1/projects?id=eq.delivered-project"):
                response = [{"status": "delivered"}]
            else:
                self.fail("Unexpected provisioning request: " + path)
            return BytesIO(json.dumps(response).encode())

        def read_text(path, *args, **kwargs):
            if path.name == "fixtures.json":
                return json.dumps(fixture)
            if path.name == ".env.local":
                return "DEMO_PASSWORD=test-password\n"
            self.fail("Unexpected file read: " + str(path))

        status = {"API_URL": "http://127.0.0.1:55421", "ANON_KEY": "test-public-key", "SERVICE_ROLE_KEY": "test-service-key"}
        with ExitStack() as patches:
            patches.enter_context(patch.object(sys, "argv", ["provision_local_auth.py", "--files-only"]))
            # The default local media worker, whatever MEDIA_URL the calling shell exports.
            patches.enter_context(patch.dict("os.environ", {k: v for k, v in os.environ.items() if k != "MEDIA_URL"}, clear=True))
            patches.enter_context(patch("subprocess.run", return_value=Mock(stdout=json.dumps(status))))
            patches.enter_context(patch.object(Path, "read_text", read_text))
            patches.enter_context(patch.object(Path, "exists", return_value=True))
            patches.enter_context(patch("urllib.request.urlopen", side_effect=respond))
            patches.enter_context(patch("fixture_media.png_card", return_value=b"cover card"))
            patches.enter_context(patch("os.open", return_value=99))
            patches.enter_context(patch("os.fdopen"))
            patches.enter_context(patch("os.chmod"))
            patches.enter_context(patch("builtins.print"))
            runpy.run_path(str(root / "supabase/scripts/provision_local_auth.py"), run_name="__main__")
        return prepared

    def test_prepares_a_hidden_cover_through_the_media_worker(self):
        prepared = self.run_provisioning()

        self.assertEqual(len(prepared), 1)
        self.assertEqual(prepared[0]["url"], "http://127.0.0.1:55430/covers/prepare?projectId=project&visible=false")
        self.assertEqual(prepared[0]["body"], b"cover card")
        self.assertEqual(prepared[0]["auth"], "Bearer agency-session")
        self.assertEqual(prepared[0]["type"], "image/png")

    def test_shows_the_cover_to_the_client_once_it_has_a_client_version(self):
        prepared = self.run_provisioning(has_version=True)

        self.assertEqual(len(prepared), 1)
        self.assertTrue(prepared[0]["url"].endswith("&visible=true"))

    def test_keeps_an_existing_cover(self):
        self.assertEqual(self.run_provisioning(has_cover=True), [])

    def test_skips_a_project_the_dataset_no_longer_holds(self):
        self.assertEqual(self.run_provisioning(in_dataset=False), [])


if __name__ == "__main__":
    unittest.main()
