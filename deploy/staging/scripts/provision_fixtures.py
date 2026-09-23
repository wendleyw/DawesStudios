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
the staging gateway read from the generated deploy/staging/.work/.env (refuses anything other
than 127.0.0.1:56010). The one secret this script mints (the fixture password) is written only to
deploy/staging/.work/fixtures.env, mode 0600, and is never printed.

Scope: fixture Auth passwords for every fixtures.json user, and the brand_assets/working_assets
Storage objects. The single delivery_files PDF that provision_local_auth.py also seeds is out of
scope here — it is one file for one project, not part of the 10-client/25-project canonical
counts this wrapper checks.
"""
from pathlib import Path
import hashlib
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

STAGING_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = STAGING_DIR.parents[1]
ENV_FILE = STAGING_DIR / ".work" / ".env"
FIXTURES_ENV = STAGING_DIR / ".work" / "fixtures.env"
FIXTURES_JSON = REPO_ROOT / "supabase" / "fixtures.json"

sys.path.insert(0, str(REPO_ROOT / "supabase" / "scripts"))
from fixture_media import png_card, monogram_svg, monogram_png, monogram_pdf, simple_pdf  # noqa: E402
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
expected_url = "http://127.0.0.1:56010"
if api_url != expected_url:
    raise SystemExit(f"Refusing to provision an unexpected gateway ({api_url}); staging must be {expected_url}.")
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
# the same password again is always safe (idempotent), so a re-run after an interrupted one just
# re-applies it — there is no other caller sharing this disposable staging environment to protect
# against, unlike supabase/scripts/provision_local_auth.py's shared local-stack scenario.
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
    if asset["kind"] == "mark":
        content = monogram_svg(asset["client_name"])
    elif asset["kind"] == "mark-png":
        content = monogram_png(asset["client_name"])
    elif asset["kind"] == "mark-pdf":
        content = monogram_pdf(asset["client_name"])
    elif asset["kind"] == "guidelines":
        content = simple_pdf(asset["client_name"] + " / Sample brand guidelines")
    else:
        content = png_card(asset["index"] + int(asset["kind"][-1]), asset["width"], asset["height"])
    fixture_object("brand-assets", asset["storage_path"], content, asset["mime_type"])
    brand_count += 1

# --- Storage objects: working + published assets --------------------------------------------
working_count = 0
publication_count = 0
for asset in fixtures.get("working_assets", []):
    design = request("/rest/v1/designs?id=eq." + asset["design_id"], method="GET")
    if not design or design[0]["internal_asset_path"] != asset["source_path"]:
        continue
    fixture_object(
        "internal-assets", asset["source_path"],
        png_card(asset["index"], asset["width"], asset["height"], internal=True), "image/png",
    )
    working_count += 1
    if not asset["published_path"]:
        continue
    clean = png_card(asset["index"], asset["width"], asset["height"])
    published = fixture_object("published-assets", asset["published_path"], clean, "image/png")
    if published.content == clean:
        # register_sanitized_asset requires auth.role() = 'service_role' (see
        # supabase/migrations/202609210007_video_provenance_attestation.sql); no token= here
        # means request() defaults to the service role key, same as provision_local_auth.py.
        request("/rest/v1/rpc/register_sanitized_asset", {
            "p_project_id": asset["project_id"], "p_bucket_id": "published-assets",
            "p_storage_path": asset["published_path"], "p_sha256": hashlib.sha256(clean).hexdigest(),
            "p_mime_type": "image/png", "p_file_size": len(clean), "p_prepared_by": agency["id"],
            "p_source_design_id": asset["design_id"], "p_source_path": asset["source_path"],
        })
    publication_count += 1

print(f"PASS brand assets provisioned/confirmed: {brand_count}")
print(f"PASS working assets provisioned/confirmed: {working_count} ({publication_count} published)")

# --- Canonical counts -------------------------------------------------------------------------
clients = request("/rest/v1/clients?select=id", method="GET")
projects = request("/rest/v1/projects?select=id", method="GET")
status = "PASS" if len(clients) == 10 and len(projects) == 25 else "FAIL"
print(f"{status} canonical counts: clients={len(clients)} projects={len(projects)} (expected 10 / 25)")
