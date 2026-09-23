"""Capture/compare local database and Storage integrity around a documented lifecycle run."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "supabase/scripts"))
from fixture_media import png_card  # noqa: E402


def sql(query):
    return subprocess.check_output([
        "docker", "exec", "supabase_db_dawes-studios", "psql", "-U", "postgres", "-d", "postgres",
        "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query,
    ], text=True).strip()


def snapshot():
    # Capture secrets without printing or including them in evidence.
    status = json.loads(subprocess.check_output(
        ["supabase", "status", "-o", "json"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL,
    ))
    if status["API_URL"] != "http://127.0.0.1:55421":
        raise RuntimeError("Startup verification is restricted to the local Dawes backend.")
    tables = sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
    records = {}
    for table in tables:
        if not table.replace("_", "").isalnum():
            raise RuntimeError("Unexpected table identifier.")
        records[table] = json.loads(sql(
            f'''select json_build_object('count', count(*), 'digest',
            md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')))
            from public."{table}" t'''
        ))
    objects = json.loads(sql("select coalesce(json_agg(json_build_object('bucket',bucket_id,'path',name) order by bucket_id,name),'[]') from storage.objects"))
    hashes = {}
    for obj in objects:
        name = obj["bucket"] + "/" + obj["path"]
        request = urllib.request.Request(
            status["API_URL"] + "/storage/v1/object/authenticated/" + urllib.parse.quote(name, safe="/"),
            headers={"apikey": status["ANON_KEY"], "Authorization": "Bearer " + status["SERVICE_ROLE_KEY"]},
        )
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=30) as response:
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                digest.update(chunk)
        hashes[name] = digest.hexdigest()
    fixtures = json.loads((ROOT / "supabase/fixtures.json").read_text())
    divergent = 0
    for obj in fixtures["working_assets"]:
        name = "internal-assets/" + obj["source_path"]
        if name in hashes:
            expected = hashlib.sha256(png_card(obj["index"], obj["width"], obj["height"], internal=True)).hexdigest()
            divergent += hashes[name] != expected
    return {"tables": records, "storage": hashes, "noncanonical_internal_artwork": divergent}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["capture", "compare", "exercise"])
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.mode == "exercise":
        exercise(args.baseline, args.output)
        return
    current = snapshot()
    if args.mode == "capture":
        args.baseline.write_text(json.dumps(current, indent=2) + "\n")
        print(f"Captured {len(current['tables'])} tables and {len(current['storage'])} stored files; {current['noncanonical_internal_artwork']} noncanonical internal artworks.")
        return
    baseline = json.loads(args.baseline.read_text())
    if current != baseline:
        changed = [key for key in current if current[key] != baseline.get(key)]
        raise RuntimeError("Startup changed captured state: " + ", ".join(changed))
    evidence = {
        "database_tables_unchanged": len(current["tables"]),
        "stored_file_hashes_unchanged": len(current["storage"]),
        "noncanonical_internal_artwork_preserved": current["noncanonical_internal_artwork"],
        "clients": current["tables"]["clients"]["count"],
        "projects": current["tables"]["projects"]["count"],
        "result": "pass",
    }
    if args.output:
        args.output.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence, indent=2))


def exercise(baseline_path, output):
    """Use one reversible internal fixture overlay to exercise the former startup failure."""
    before = snapshot()
    baseline_path.write_text(json.dumps(before, indent=2) + "\n")
    status = json.loads(subprocess.check_output(
        ["supabase", "status", "-o", "json"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL,
    ))
    fixtures = json.loads((ROOT / "supabase/fixtures.json").read_text())
    obj = fixtures["working_assets"][0]
    path = "internal-assets/" + obj["source_path"]
    headers = {"apikey": status["ANON_KEY"], "Authorization": "Bearer " + status["SERVICE_ROLE_KEY"], "Content-Type": "image/png"}

    def read():
        with urllib.request.urlopen(urllib.request.Request(
            status["API_URL"] + "/storage/v1/object/authenticated/" + path, headers=headers,
        ), timeout=30) as response:
            return response.read()

    def write(content):
        with urllib.request.urlopen(urllib.request.Request(
            status["API_URL"] + "/storage/v1/object/" + path, headers=headers, data=content, method="PUT",
        ), timeout=30) as response:
            response.read()

    original = read()
    if hashlib.sha256(original).hexdigest() != before["storage"][path]:
        raise RuntimeError("Fixture changed during capture; refusing an overlapping write.")
    replacement = png_card(obj["index"] + 1000, obj["width"], obj["height"], internal=True)
    if original == replacement:
        raise RuntimeError("The overlay must differ from the original object.")
    write(replacement)
    try:
        overlay = snapshot()
        if overlay["noncanonical_internal_artwork"] == 0:
            raise RuntimeError("The test must exercise noncanonical artwork.")
        for command in ("db:start", "db:stop", "db:start", "db:status"):
            subprocess.run(["npm", "run", command], cwd=ROOT, check=True)
        after = snapshot()
        if after != overlay:
            raise RuntimeError("Lifecycle changed database records or stored artwork.")
    finally:
        # Do not overwrite an unrelated concurrent edit during cleanup.
        if read() != replacement:
            raise RuntimeError("Overlay changed unexpectedly; refusing to overwrite another writer.")
        write(original)
    if snapshot() != before:
        raise RuntimeError("The original fixture state was not restored.")
    evidence = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "commands": ["npm run db:start", "npm run db:stop", "npm run db:start", "npm run db:status"],
        "database_tables_unchanged": len(before["tables"]),
        "stored_file_hashes_unchanged": len(before["storage"]),
        "noncanonical_internal_artwork_during_restart": overlay["noncanonical_internal_artwork"],
        "temporary_overlay_restored": True,
        "clients": before["tables"]["clients"]["count"],
        "projects": before["tables"]["projects"]["count"],
        "result": "pass",
    }
    if output:
        output.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
