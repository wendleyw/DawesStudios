#!/usr/bin/env python3
"""Provision fixture Auth passwords and fixture Storage objects against the LOCAL STAGING
rehearsal only (see ../README.md). This is a thin wrapper: it imports the reusable, generic
helpers from supabase/scripts (`ensure_fixture_object` from fixture_provisioning.py, the content
generators from fixture_media.py) instead of copying or editing them. It does not import
supabase/scripts/provision_local_auth.py itself, because that script calls `supabase status`
(the CLI-tracked local project only) and hardcodes an `expected_url` guard for the local stack
(127.0.0.1:55421) and the restore-drill copy (127.0.0.1:55521) — neither resolves this staging
rehearsal, which runs as a plain `docker compose` project the Supabase CLI does not track.

Never touches supabase/.env.local, supabase/seed.sql, supabase/scripts/* or apps/**. Targets only
the selected staging gateway read from its generated .env (refuses any port outside the two
rehearsals). The one secret this script mints (the fixture password) is written only to that
rehearsal's ignored fixtures.env, mode 0600, and is never printed.

Scope: fixture Auth passwords for every fixtures.json user, the brand_assets Storage objects, and
one project cover per project, posted to the selected staging media worker (started by
`stage.sh app-up`) so it is sanitized and attested exactly as in production, and the single
delivery_files PDF that marks the delivery project delivered, as provision_local_auth.py does.
"""
from pathlib import Path
import json
import os
import secrets
import uuid
import hashlib
import sys
import urllib.error
import urllib.request

STAGING_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = STAGING_DIR.parents[1]
STAGING_STORAGE = os.environ.get("STAGING_STORAGE", "minio")
if STAGING_STORAGE not in ("minio", "file"):
    raise SystemExit("STAGING_STORAGE must be minio or file.")
WORK_DIR = STAGING_DIR / (".work-file" if STAGING_STORAGE == "file" else ".work")
ENV_FILE = WORK_DIR / ".env"
FIXTURES_ENV = WORK_DIR / "fixtures.env"
FIXTURES_JSON = REPO_ROOT / "supabase" / "fixtures.json"

sys.path.insert(0, str(REPO_ROOT / "supabase" / "scripts"))
from fixture_media import png_card, brand_asset_bytes, delivery_pdf  # noqa: E402
from fixture_provisioning import ensure_fixture_object  # noqa: E402


def load_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key] = value
    return values


if not ENV_FILE.exists():
    raise SystemExit(f"Not prepared: {ENV_FILE} missing. Run stage.sh up first.")
env = load_env(ENV_FILE)
api_url = f"http://127.0.0.1:{env.get('STAGING_GATEWAY_PORT', '')}"
expected_url = "http://127.0.0.1:56110" if STAGING_STORAGE == "file" else "http://127.0.0.1:56010"
if api_url != expected_url:
    raise SystemExit(f"Refusing to provision an unexpected gateway ({api_url}); staging must be {expected_url}.")
media_url = f"http://127.0.0.1:{env.get('MEDIA_PORT', '')}"
expected_media_url = "http://127.0.0.1:56114" if STAGING_STORAGE == "file" else "http://127.0.0.1:56014"
if media_url != expected_media_url:
    raise SystemExit(f"Refusing to use an unexpected media worker ({media_url}); staging must be {expected_media_url}.")
anon_key = env["ANON_KEY"]
service_role_key = env["SERVICE_ROLE_KEY"]

fixtures = json.loads(FIXTURES_JSON.read_text())
agency = next(user for user in fixtures["users"] if user["role"] == "agency")


def request(path, data=None, method="POST", token=None, content_type="application/json"):
    body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        api_url + path, data=body, method=method,
        headers={
            "apikey": anon_key,
            "Authorization": "Bearer " + (token or service_role_key),
            "Content-Type": content_type,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()
            return json.loads(content) if content else None
    except urllib.error.HTTPError as exc:
        try:
            reason = json.loads(exc.read()).get("msg") or str(exc.code)
        except Exception:
            reason = str(exc.code)
        raise RuntimeError(f"Staging provisioning request failed ({reason})") from None


def write_fixtures_env(password):
    content = "\n".join([
        "# Staging fixture credentials. Local rehearsal only. Never deploy or commit.",
        "SUPABASE_URL=" + api_url,
        "SUPABASE_ANON_KEY=" + anon_key,
        "SUPABASE_SERVICE_ROLE_KEY=" + service_role_key,
        "DEMO_PASSWORD=" + password,
        "DEMO_AGENCY_EMAIL=" + agency["email"],
        "DEMO_DESIGNER_EMAIL=designer@dawes.local",
        "DEMO_CLIENT_EMAIL=sabre@client.dawes.local",
    ]) + "\n"
    fd = os.open(FIXTURES_ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(content)
    os.chmod(FIXTURES_ENV, 0o600)
    print(f"Wrote {FIXTURES_ENV} (mode 0600)")


# --- Auth passwords ---------------------------------------------------------------------------
# The password is written to FIXTURES_ENV *before* the PUT loop that sets it on every fixture
# user, not after: this is the only secret this script mints, and a crash partway through the PUT
# loop must never leave a password set on the server that is not yet recoverable from disk. PUTting
# the same password again is always safe (idempotent), so every run re-applies it — which also covers
# a re-seeded rehearsal whose fixture users were recreated without one. There is no other caller
# sharing this disposable staging environment to protect against, unlike
# supabase/scripts/provision_local_auth.py's shared local-stack scenario.
if FIXTURES_ENV.exists():
    password = load_env(FIXTURES_ENV).get("DEMO_PASSWORD")
    if not password:
        raise SystemExit(f"{FIXTURES_ENV} exists but has no DEMO_PASSWORD; remove it and re-run.")
    print(f"Reusing the password already minted in {FIXTURES_ENV}")
else:
    password = "Dawes!" + secrets.token_urlsafe(24) + "9aA"
    write_fixtures_env(password)
for user in fixtures["users"]:
    request("/auth/v1/admin/users/" + user["id"], {"password": password, "email_confirm": True}, method="PUT")
print(f"PASS set the Auth password for {len(fixtures['users'])} fixture users")

session = request("/auth/v1/token?grant_type=password", {"email": agency["email"], "password": password})
agency_token = session["access_token"]
print("PASS agency password grant issued an access token")


def fixture_object(bucket, path, content, mime):
    return ensure_fixture_object(api_url, anon_key, service_role_key, bucket, path, content, mime)


# --- Storage objects: brand assets ---------------------------------------------------------
brand_count = 0
for asset in fixtures.get("brand_assets", []):
    # A normal re-run on an already-provisioned dataset must not create unregistered new objects.
    if not request("/rest/v1/brand_assets?id=eq." + asset["id"], method="GET"):
        continue
    fixture_object("brand-assets", asset["storage_path"], brand_asset_bytes(asset), asset["mime_type"])
    brand_count += 1

# --- Project covers, through the media worker -----------------------------------------------
# set_project_cover accepts only a cover the media worker sanitized and attested, so the bytes are
# posted to /covers/prepare under the agency session. An existing cover is kept; the client sees a
# cover only on a project that already has a client version.
def media_prepare(project_id, content, visible):
    req = urllib.request.Request(
        f"{media_url}/covers/prepare?projectId={project_id}&visible={'true' if visible else 'false'}",
        data=content, method="POST",
        headers={"Authorization": "Bearer " + agency_token, "Content-Type": "image/png"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            reason = json.loads(exc.read()).get("error") or str(exc.code)
        except Exception:
            reason = str(exc.code)
        raise RuntimeError(f"Staging cover preparation failed ({reason})") from None
    except urllib.error.URLError:
        raise SystemExit(f"The staging media worker is not reachable at {media_url}. Run stage.sh app-up first.") from None


cover_count = 0
kept_cover_count = 0
for cover in fixtures.get("covers", []):
    if not request("/rest/v1/projects?select=id&id=eq." + cover["project_id"], method="GET"):
        continue
    if request("/rest/v1/project_covers?select=project_id&project_id=eq." + cover["project_id"], method="GET"):
        kept_cover_count += 1
        continue
    visible = bool(request("/rest/v1/published_versions?select=id&project_id=eq." + cover["project_id"], method="GET"))
    media_prepare(cover["project_id"], png_card(cover["index"], cover["width"], cover["height"]), visible)
    cover_count += 1

print(f"PASS brand assets provisioned/confirmed: {brand_count}")
print(f"PASS project covers: {cover_count} prepared through the media worker, {kept_cover_count} kept")

# --- Delivery fixture ------------------------------------------------------------------------
# The same minimal PDF (fixture_media.delivery_pdf) provision_local_auth.py attaches to the approved delivery project, after
# which the project is marked delivered. A project that already has its file is left alone.
delivery_project = fixtures["delivery_project_id"]
if not request("/rest/v1/delivery_files?project_id=eq." + delivery_project, method="GET", token=agency_token):
    pdf = delivery_pdf()
    path = delivery_project + "/" + str(uuid.uuid4()) + ".pdf"
    request("/storage/v1/object/delivery-files/" + path, pdf, content_type="application/pdf")
    request("/rest/v1/rpc/register_sanitized_asset", {"p_project_id": delivery_project, "p_bucket_id": "delivery-files", "p_storage_path": path, "p_sha256": hashlib.sha256(pdf).hexdigest(), "p_mime_type": "application/pdf", "p_file_size": len(pdf), "p_prepared_by": agency["id"]})
    request("/rest/v1/rpc/add_delivery_file", {"p_project_id": delivery_project, "p_name": "Approved creative direction.pdf", "p_storage_path": path, "p_mime_type": "application/pdf", "p_file_size": len(pdf)}, token=agency_token)
state = request("/rest/v1/projects?id=eq." + delivery_project + "&select=status", method="GET", token=agency_token)
if state[0]["status"] == "approved":
    request("/rest/v1/rpc/mark_project_delivered", {"p_project_id": delivery_project}, token=agency_token)
print("PASS delivery fixture attached and its project delivered")

# --- Canonical counts -------------------------------------------------------------------------
clients = request("/rest/v1/clients?select=id", method="GET")
projects = request("/rest/v1/projects?select=id", method="GET")
status = "PASS" if len(clients) == 10 and len(projects) == 25 else "FAIL"
print(f"{status} canonical counts: clients={len(clients)} projects={len(projects)} (expected 10 / 25)")
if status == "FAIL":
    raise SystemExit(1)
