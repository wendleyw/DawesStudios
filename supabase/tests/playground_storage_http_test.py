"""Exercise real local Playground uploads, private downloads and authorization boundaries."""

import base64
from concurrent.futures import ThreadPoolExecutor
import io
import unittest
import uuid
import zipfile

from http_auth_storage_test import ENV, api


class PlaygroundStorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokens = {}
        cls.users = {}
        for role, email in (
            ("agency", "studio@dawes.local"),
            ("client", "sabre@client.dawes.local"),
            ("designer", "designer@dawes.local"),
            ("stranger", "northfield-bank@client.dawes.local"),
        ):
            status, result = api(
                "/auth/v1/token?grant_type=password", "POST",
                {"email": email, "password": ENV["DEMO_PASSWORD"]},
            )
            if status != 200:
                raise RuntimeError(f"Fixture sign-in failed for {role}: HTTP {status}")
            cls.tokens[role] = result["access_token"]
            cls.users[role] = result["user"]["id"]
        cls.admin = ENV["SUPABASE_SERVICE_ROLE_KEY"]
        cls.client_id = str(uuid.uuid4())
        cls.project_id = str(uuid.uuid4())
        cls.second_project_id = str(uuid.uuid4())
        cls.name = "Playground HTTP " + cls.client_id
        cls.paths = set()
        cls.boards = {}
        cls.project_boards = {}
        cls.addClassCleanup(cls.cleanup)
        cls.require(api("/rest/v1/clients", "POST", {
            "id": cls.client_id, "name": cls.name, "slug": "playground-http-" + cls.client_id,
        }, cls.admin), (201,), "Create isolated client")
        for project_id in (cls.project_id, cls.second_project_id):
            cls.require(api("/rest/v1/projects", "POST", {
                "id": project_id, "client_id": cls.client_id,
                "title": cls.name, "service_type": "static-ad",
            }, cls.admin), (201,), "Create isolated project")
        cls.require(api("/rest/v1/client_memberships", "POST", {
            "client_id": cls.client_id, "user_id": cls.users["client"],
        }, cls.admin), (201,), "Attach test client contact")
        for project_id in (cls.project_id, cls.second_project_id):
            cls.require(api("/rest/v1/project_assignments", "POST", {
                "project_id": project_id, "designer_id": cls.users["designer"],
            }, cls.admin), (201,), "Assign isolated project")
        for role in ("agency", "client", "designer"):
            cls.boards[role] = cls.require(api(
                "/rest/v1/rpc/get_playground_board", "POST",
                {"p_client_id": cls.client_id, "p_project_id": cls.project_id}, cls.tokens[role],
            ), (200,), "Resolve role board")
            cls.project_boards[role] = cls.require(api(
                "/rest/v1/rpc/get_playground_board", "POST",
                {"p_client_id": cls.client_id, "p_project_id": cls.second_project_id}, cls.tokens[role],
            ), (200,), "Resolve project role board")

    @staticmethod
    def require(result, expected, action):
        status, body = result
        if status not in expected:
            raise AssertionError(f"{action}: HTTP {status}, expected {expected}: {body}")
        return body

    @classmethod
    def cleanup(cls):
        rows = cls.require(api(
            "/rest/v1/clients?id=eq." + cls.client_id + "&select=name", token=cls.admin,
        ), (200,), "Find isolated client for cleanup")
        if not rows:
            return
        if rows != [{"name": cls.name}] or not cls.name.startswith("Playground HTTP "):
            raise RuntimeError("Refusing to delete an unrecognized Playground HTTP fixture.")
        if cls.paths:
            cls.require(api(
                "/storage/v1/object/playground-assets", "DELETE",
                {"prefixes": sorted(cls.paths)}, cls.admin,
            ), (200,), "Remove test upload bytes")
        boards = cls.require(api(
            "/rest/v1/playground_boards?client_id=eq." + cls.client_id + "&select=id",
            token=cls.admin,
        ), (200,), "Read isolated board IDs")
        for board in boards:
            cls.require(api(
                "/rest/v1/playground_items?board_id=eq." + board["id"], "DELETE", token=cls.admin,
            ), (204,), "Remove isolated items")
        for table, field, identifier in (
            ("playground_boards", "client_id", cls.client_id),
            ("project_assignments", "project_id", cls.project_id),
            ("project_assignments", "project_id", cls.second_project_id),
            ("projects", "id", cls.project_id),
            ("projects", "id", cls.second_project_id),
            ("client_memberships", "client_id", cls.client_id),
            ("credit_accounts", "client_id", cls.client_id),
            ("clients", "id", cls.client_id),
        ):
            cls.require(api(
                f"/rest/v1/{table}?{field}=eq.{identifier}", "DELETE", token=cls.admin,
            ), (204,), "Remove isolated " + table)
        remaining = cls.require(api(
            "/rest/v1/clients?id=eq." + cls.client_id, token=cls.admin,
        ), (200,), "Verify fixture cleanup")
        if remaining:
            raise AssertionError("The temporary Playground client was not removed.")

    def file_input(self, role, filename, mime, body):
        item_id = str(uuid.uuid4())
        path = self.boards[role] + "/" + item_id + "/" + filename
        self.paths.add(path)
        self.require(api(
            "/storage/v1/object/playground-assets/" + path, "POST", body, self.tokens[role], mime,
        ), (200,), "Upload real private bytes")
        return {
            "id": item_id, "kind": "image" if mime.startswith("image/") else "file",
            "title": filename, "body": "", "asset_path": path, "mime_type": mime,
            "x": 0, "y": 0, "width": 280, "height": 200,
        }

    def save(self, role, item, revision=None):
        return api("/rest/v1/rpc/save_playground_item", "POST", {
            "p_board_id": self.boards[role], "p_item": item, "p_expected_revision": revision,
        }, self.tokens[role])

    def test_anonymous_rpc_and_storage_are_denied(self):
        self.assertEqual(api("/rest/v1/rpc/get_playground_board", "POST", {
            "p_client_id": self.client_id, "p_project_id": self.project_id,
        })[0], 401)
        status, rows = api(
            "/storage/v1/object/list/playground-assets", "POST",
            {"prefix": self.boards["client"], "limit": 100},
        )
        if status == 200:
            self.assertEqual(rows, [], "Anonymous Storage listing must not reveal private files")
        else:
            self.assertIn(status, (400, 401, 403))

    def test_role_project_and_tenant_scopes_are_isolated(self):
        self.assertEqual(len(set(self.boards.values()) | set(self.project_boards.values())), 6)
        for role in ("agency", "client", "designer"):
            for other_role in ("agency", "client", "designer"):
                if role == other_role:
                    continue
                rows = self.require(api(
                    "/rest/v1/playground_boards?id=eq." + self.boards[other_role],
                    token=self.tokens[role],
                ), (200,), "Read a different role board")
                self.assertEqual(rows, [])
        self.assertEqual(api("/rest/v1/rpc/get_playground_board", "POST", {
            "p_client_id": self.client_id, "p_project_id": self.project_id,
        }, self.tokens["stranger"])[0], 403)

    def test_workspace_scope_and_privileged_null_inserts_are_refused(self):
        for role in ("agency", "client", "designer"):
            for scope in ({}, {"p_project_id": None}):
                with self.subTest(role=role, scope=scope):
                    status, error = api("/rest/v1/rpc/get_playground_board", "POST", {
                        "p_client_id": self.client_id, **scope,
                    }, self.tokens[role])
                    self.assertEqual(status, 403)
                    self.assertEqual(error["code"], "42501")
                    self.assertEqual(error["message"], "A project is required for Playground")
        status, error = api("/rest/v1/playground_boards", "POST", {
            "client_id": self.client_id, "role": "agency", "project_id": None,
        }, self.admin)
        self.assertEqual(status, 400)
        self.assertEqual(error["code"], "23514")
        rows = self.require(api(
            "/rest/v1/playground_boards?client_id=eq." + self.client_id + "&project_id=is.null",
            token=self.admin,
        ), (200,), "Check rejected workspace scopes")
        self.assertEqual(rows, [])

    def test_existing_legacy_records_and_files_are_hidden_without_mutating_them(self):
        # Inspect actual preserved records read-only. Destructive denial probes use a synthetic
        # pre-migration fixture inside the pgTAP rollback; never risk an original user item here.
        boards = self.require(api(
            "/rest/v1/playground_boards?project_id=is.null", token=self.admin,
        ), (200,), "Read legacy records as administrator")
        for board in boards:
            items = self.require(api(
                "/rest/v1/playground_items?board_id=eq." + board["id"], token=self.admin,
            ), (200,), "Read preserved legacy inventory")
            for role in ("agency", "client", "designer"):
                self.assertEqual(self.require(api(
                    "/rest/v1/playground_boards?id=eq." + board["id"], token=self.tokens[role],
                ), (200,), "Read legacy board through RLS"), [])
                self.assertEqual(self.require(api(
                    "/rest/v1/playground_items?board_id=eq." + board["id"], token=self.tokens[role],
                ), (200,), "Read legacy items through RLS"), [])
                self.assertEqual(api(
                    "/rest/v1/rpc/get_playground_cleanup", "POST",
                    {"p_board_id": board["id"]}, self.tokens[role],
                )[0], 403)
                for item in items:
                    path = item["asset_path"]
                    if path:
                        self.assertNotEqual(api(
                            "/storage/v1/object/authenticated/playground-assets/" + path,
                            token=self.tokens[role],
                        )[0], 200)
                        self.assertNotEqual(api(
                            "/storage/v1/object/sign/playground-assets/" + path, "POST",
                            {"expiresIn": 60}, self.tokens[role],
                        )[0], 200)
            self.assertEqual(self.require(api(
                "/rest/v1/playground_items?board_id=eq." + board["id"], token=self.admin,
            ), (200,), "Recheck preserved legacy content"), items)

    def test_all_roles_upload_save_and_download_real_documents_and_images(self):
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII="
        )
        office = io.BytesIO()
        with zipfile.ZipFile(office, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", (
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                '</Types>'
            ))
            archive.writestr("_rels/.rels", (
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                '</Relationships>'
            ))
            archive.writestr("word/document.xml", (
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body><w:p><w:r><w:t>Private Playground document.</w:t></w:r></w:p></w:body></w:document>'
            ))
        for role in ("agency", "client", "designer"):
            for filename, mime, body in (
                ("reference.png", "image/png", png),
                ("brief.txt", "text/plain", b"A persisted private brainstorm document.\n"),
                ("reference.pdf", "application/pdf", b"%PDF-1.4\n% Playground HTTP fixture\n%%EOF\n"),
                ("brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", office.getvalue()),
            ):
                with self.subTest(role=role, mime=mime):
                    item = self.file_input(role, filename, mime, body)
                    saved = self.require(self.save(role, item), (200,), "Attach uploaded bytes")
                    self.assertEqual(saved["revision"], 1)
                    self.assertEqual(saved["asset_path"], item["asset_path"])
                    path = item["asset_path"]
                    downloaded = self.require(api(
                        "/storage/v1/object/authenticated/playground-assets/" + path,
                        token=self.tokens[role],
                    ), (200,), "Download authenticated original")
                    self.assertEqual(downloaded, body)
                    signed = self.require(api(
                        "/storage/v1/object/sign/playground-assets/" + path, "POST",
                        {"expiresIn": 60}, self.tokens[role],
                    ), (200,), "Sign an authorized download")
                    signed_path = "/storage/v1" + signed["signedURL"]
                    self.assertEqual(self.require(api(signed_path), (200,), "Download signed bytes"), body)
                    for other_role in ("agency", "client", "designer", "stranger"):
                        if other_role == role:
                            continue
                        self.assertNotEqual(api(
                            "/storage/v1/object/authenticated/playground-assets/" + path,
                            token=self.tokens[other_role],
                        )[0], 200)
                        self.assertNotEqual(api(
                            "/storage/v1/object/sign/playground-assets/" + path, "POST",
                            {"expiresIn": 60}, self.tokens[other_role],
                        )[0], 200)

    def test_foreign_upload_and_unsupported_types_are_refused(self):
        path = self.boards["agency"] + "/" + str(uuid.uuid4()) + "/forged.txt"
        self.paths.add(path)
        self.assertNotEqual(api(
            "/storage/v1/object/playground-assets/" + path, "POST", b"Forbidden",
            self.tokens["client"], "text/plain",
        )[0], 200)
        path = self.boards["client"] + "/" + str(uuid.uuid4()) + "/script.html"
        self.paths.add(path)
        self.assertNotEqual(api(
            "/storage/v1/object/playground-assets/" + path, "POST", b"<script>1</script>",
            self.tokens["client"], "text/html",
        )[0], 200)

    def test_duplicate_upload_never_overwrites_and_cleanup_survives_reload(self):
        role = "client"
        original = b"Keep the original bytes.\n"
        item = self.file_input(role, "original.txt", "text/plain", original)
        path = item["asset_path"]
        self.assertNotEqual(api(
            "/storage/v1/object/playground-assets/" + path, "POST", b"Replacement",
            self.tokens[role], "text/plain",
        )[0], 200)
        self.require(self.save(role, item), (200,), "Save cleanup probe")
        # A direct Storage delete of an attached live file must have no effect, even if the API
        # chooses an empty successful result for a policy-filtered DELETE.
        api("/storage/v1/object/playground-assets", "DELETE", {"prefixes": [path]}, self.tokens[role])
        self.assertEqual(self.require(api(
            "/storage/v1/object/authenticated/playground-assets/" + path, token=self.tokens[role],
        ), (200,), "Read after forbidden overwrite/delete"), original)
        request = {
            "p_board_id": self.boards[role], "p_item_id": item["id"],
            "p_expected_revision": 1, "p_asset_path": path,
        }
        self.assertEqual(self.require(api(
            "/rest/v1/rpc/delete_playground_item", "POST", request, self.tokens[role],
        ), (200,), "Commit item deletion"), path)
        pending = self.require(api(
            "/rest/v1/rpc/get_playground_cleanup", "POST",
            {"p_board_id": self.boards[role]}, self.tokens[role],
        ), (200,), "Discover cleanup after reload")
        self.assertIn({"path": path}, pending)
        self.require(api(
            "/storage/v1/object/playground-assets", "DELETE", {"prefixes": [path]}, self.tokens[role],
        ), (200,), "Finish delayed file cleanup")
        self.assertNotEqual(api(
            "/storage/v1/object/authenticated/playground-assets/" + path, token=self.tokens[role],
        )[0], 200)

    def test_concurrent_edits_have_one_winner(self):
        item = {
            "id": str(uuid.uuid4()), "kind": "note", "title": "Concurrent note", "body": "Initial",
            "asset_path": None, "mime_type": None, "x": 0, "y": 0, "width": 280, "height": 180,
        }
        self.require(self.save("client", item), (200,), "Create concurrent note")
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(
                lambda text: self.save("client", {**item, "body": text}, 1), ("First edit", "Second edit"),
            ))
        self.assertEqual(sorted(status for status, _ in results), [200, 409])
        rejected = next(result for status, result in results if status == 409)
        self.assertEqual(rejected["code"], "PT409")


if __name__ == "__main__":
    unittest.main(verbosity=2)
