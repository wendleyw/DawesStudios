"""Create missing local fixture objects while preserving stored artwork."""

from dataclasses import dataclass
import json
import urllib.error
import urllib.request


@dataclass(frozen=True)
class FixtureObject:
    content: bytes
    created: bool


class _StorageError(RuntimeError):
    def __init__(self, method, status, kind):
        super().__init__(f"Local fixture Storage {method} failed (HTTP {status}).")
        self.kind = kind


def _error_kind(status, payload):
    if not isinstance(payload, dict):
        return None
    # Prefer structured codes. Older Storage versions return the legacy error/message pair
    # and can wrap their 404/409 object errors in an HTTP 400 response.
    code = payload.get("code")
    if status in (400, 404) and (
        code == "NoSuchKey"
        or (code is None and payload.get("error") == "not_found"
            and payload.get("message") == "Object not found")
    ):
        return "missing"
    if status in (400, 409) and (
        code in ("ResourceAlreadyExists", "KeyAlreadyExists")
        or (code is None and payload.get("error") == "Duplicate"
            and payload.get("message") == "The resource already exists")
    ):
        return "duplicate"
    return None


def _storage_request(request, open_url):
    try:
        with open_url(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read())
        except (ValueError, UnicodeError):
            payload = None
        finally:
            error.close()
        # Keep response bodies, headers and credentials out of failure messages.
        raise _StorageError(request.get_method(), error.code, _error_kind(error.code, payload)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"Local fixture Storage {request.get_method()} transport failed.") from None


def ensure_fixture_object(api_url, api_key, service_key, bucket, path, content, mime, *,
                          open_url=urllib.request.urlopen):
    """Return the stored object, creating canonical bytes only when it is absent.

    Any existing bytes win, including a concurrent upload. Callers may attest to canonical
    content only when the returned bytes match what they generated. This is provisioning,
    not the strict canonical fixture verification performed by verify_seed.py.
    """
    headers = {"apikey": api_key, "Authorization": "Bearer " + service_key}
    object_url = api_url + "/storage/v1/object/" + bucket + "/" + path
    read = urllib.request.Request(
        api_url + "/storage/v1/object/authenticated/" + bucket + "/" + path,
        headers=headers,
    )
    try:
        return FixtureObject(_storage_request(read, open_url), created=False)
    except _StorageError as error:
        if error.kind != "missing":
            raise

    create = urllib.request.Request(
        object_url, data=content, method="POST",
        headers={**headers, "Content-Type": mime, "x-upsert": "false"},
    )
    try:
        _storage_request(create, open_url)
        return FixtureObject(content, created=True)
    except _StorageError as error:
        if error.kind != "duplicate":
            raise
    # Another writer won between GET and POST. Never overwrite it or report success
    # without verifying that its object can actually be read.
    return FixtureObject(_storage_request(read, open_url), created=False)
