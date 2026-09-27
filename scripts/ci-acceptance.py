"""Bootstrap and check a throwaway GitHub Actions acceptance stack.

This script refuses non-GitHub runners and an existing fixture credential file. It never links a
remote Supabase project, and all credentials stay in ignored or runner-private files.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import tomllib
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "supabase/.env.local"
API_URL = "http://127.0.0.1:55421"
ACCEPTANCE_URL = "http://localhost:55421"
MEDIA_URL = "http://127.0.0.1:55430"
DB_CONTAINER = "supabase_db_dawes-studios"
TABLES = (
    "clients", "projects", "campaigns", "briefings", "design_boards",
    "design_versions", "published_versions", "notifications",
)


def guard():
    workspace = os.environ.get("GITHUB_WORKSPACE")
    temporary = os.environ.get("RUNNER_TEMP")
    if os.environ.get("GITHUB_ACTIONS") != "true" or not workspace or not temporary:
        raise SystemExit("Acceptance bootstrap runs only on a disposable GitHub Actions runner.")
    if Path(workspace).resolve() != ROOT or not Path(temporary).is_dir():
        raise SystemExit("GitHub runner workspace or temporary directory does not match.")
    if tomllib.loads((ROOT / "supabase/config.toml").read_text())["project_id"] != "dawes-studios":
        raise SystemExit("Unexpected local Supabase project ID.")


def run(*args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        log = Path(os.environ["RUNNER_TEMP"]) / "dawes-acceptance-command.log"
        log.write_text(result.stdout + result.stderr)
        log.chmod(0o600)
        raise SystemExit(
            f"Acceptance command failed: {' '.join(args[:4])}. Inspect the private runner log."
        )
    return result.stdout


def status():
    details = json.loads(run("supabase", "status", "-o", "json"))
    if details.get("API_URL") != API_URL:
        raise SystemExit("The Supabase CLI did not start the expected loopback API.")
    image = run("docker", "inspect", "--format", "{{.Config.Image}}", DB_CONTAINER).strip()
    if "supabase/postgres:" not in image:
        raise SystemExit("The expected local database container is absent.")
    return details


def fixture_env():
    values = dict(
        line.split("=", 1)
        for line in ENV_FILE.read_text().splitlines()
        if "=" in line and not line.startswith("#")
    )
    if values.get("SUPABASE_URL") != API_URL:
        raise SystemExit("Fixture credentials do not name the disposable loopback backend.")
    for name in ("SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_PASSWORD"):
        if not values.get(name):
            raise SystemExit(f"Fixture credentials are missing {name}.")
    return values


def media_health():
    try:
        with urllib.request.urlopen(MEDIA_URL + "/health", timeout=2) as response:
            return json.load(response).get("service") == "dawes-media"
    except (urllib.error.URLError, TimeoutError):
        return False


def export_environment(values):
    variables = {
        "NEXT_PUBLIC_SUPABASE_URL": API_URL,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": values["SUPABASE_ANON_KEY"],
        "NEXT_PUBLIC_MEDIA_URL": MEDIA_URL,
        "SUPABASE_SERVICE_ROLE_KEY": values["SUPABASE_SERVICE_ROLE_KEY"],
        "SUPABASE_INTERNAL_URL": API_URL,
        "APP_ORIGIN": "http://localhost:3003",
        "PLAYWRIGHT_BASE_URL": "http://localhost:3003",
        "ACCEPTANCE_SUPABASE_URL": ACCEPTANCE_URL,
        "ACCEPTANCE_SUPABASE_ANON_KEY": values["SUPABASE_ANON_KEY"],
        "ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY": values["SUPABASE_SERVICE_ROLE_KEY"],
        "ACCEPTANCE_DEMO_PASSWORD": values["DEMO_PASSWORD"],
        "ACCEPTANCE_DB_CONTAINER": DB_CONTAINER,
    }
    for name in ("SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_PASSWORD"):
        print("::add-mask::" + values[name], flush=True)
    with Path(os.environ["GITHUB_ENV"]).open("a") as environment:
        for name, value in variables.items():
            if "\n" in value or "\r" in value:
                raise SystemExit(f"Invalid line break in {name}.")
            environment.write(f"{name}={value}\n")


def bootstrap():
    guard()
    if ENV_FILE.exists():
        raise SystemExit("Fixture credential file already exists; refusing to reuse a backend.")
    existing = run("docker", "ps", "-aq", "--filter", "name=supabase_", "--filter", "label=com.supabase.cli.project=dawes-studios")
    volumes = run("docker", "volume", "ls", "-q", "--filter", "label=com.supabase.cli.project=dawes-studios")
    # Fail closed even when no credential file survived a prior runner attempt.
    named_database = subprocess.run(
        ["docker", "inspect", DB_CONTAINER], cwd=ROOT, capture_output=True, text=True,
    )
    if existing.strip() or volumes.strip() or named_database.returncode == 0:
        raise SystemExit("Supabase containers or volumes already exist; a fresh runner is required.")
    run("supabase", "start", "--yes")
    status()
    # PostgreSQL 17.6.1.106 needs the project's narrow local permission-hint workaround.
    sys.path.insert(0, str(ROOT / "supabase/scripts"))
    from local_stack import configure_database_compatibility

    configure_database_compatibility()
    run("supabase", "migration", "up", "--local", "--yes")
    details = status()
    temporary = Path(os.environ["RUNNER_TEMP"])
    media_environment = os.environ.copy()
    media_environment.update({
        "SUPABASE_URL": API_URL,
        "SUPABASE_ANON_KEY": details["ANON_KEY"],
        "SUPABASE_SERVICE_ROLE_KEY": details["SERVICE_ROLE_KEY"],
        "APP_ORIGIN": "http://localhost:3003",
        "MEDIA_ALLOWED_ORIGINS": "http://127.0.0.1:3003",
        "MEDIA_PORT": "55430",
        "MEDIA_HOST": "127.0.0.1",
    })
    media_log = temporary / "dawes-media.log"
    with media_log.open("w") as output:
        media_log.chmod(0o600)
        worker = subprocess.Popen(
            ["node", "src/server.js"], cwd=ROOT / "apps/media", env=media_environment,
            stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
        )
    for _ in range(60):
        if media_health():
            break
        if worker.poll() is not None:
            raise SystemExit("The CI media worker stopped during startup. Inspect the runner log.")
        time.sleep(1)
    else:
        raise SystemExit("The CI media worker did not become healthy.")
    run(sys.executable, "supabase/scripts/provision_local_auth.py")
    export_environment(fixture_env())
    print("Disposable Supabase, Auth, Storage, media and fixture accounts are ready.")


def counts():
    status()
    columns = ", ".join(f"'{name}', (select count(*) from public.{name})" for name in TABLES)
    sql = "select json_build_object(" + columns + ");"
    output = run(
        "docker", "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
        "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql,
    )
    result = json.loads(output.strip())
    if result["clients"] != 10 or result["projects"] != 25:
        raise SystemExit("Acceptance requires exactly 10 clients and 25 projects.")
    return result


def snapshot(phase):
    guard()
    fixture_env()
    baseline = Path(os.environ["RUNNER_TEMP"]) / "dawes-acceptance-baseline.json"
    current = counts()
    if phase == "before":
        if baseline.exists():
            raise SystemExit("A baseline already exists on this runner.")
        baseline.write_text(json.dumps(current, sort_keys=True) + "\n")
        baseline.chmod(0o600)
    else:
        if not baseline.exists():
            raise SystemExit("The before-browser baseline is missing.")
        expected = json.loads(baseline.read_text())
        if current != expected:
            raise SystemExit(f"Acceptance browser tests changed fixture table counts: {expected} -> {current}")
    print(f"Eight-table canonical fixture {phase} browser: {json.dumps(current, sort_keys=True)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("guard", "bootstrap", "snapshot"))
    parser.add_argument("phase", nargs="?", choices=("before", "after"))
    args = parser.parse_args()
    if args.action == "guard":
        guard()
    elif args.action == "bootstrap":
        bootstrap()
    elif not args.phase:
        parser.error("snapshot requires before or after")
    else:
        snapshot(args.phase)


if __name__ == "__main__":
    main()
