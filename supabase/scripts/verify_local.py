"""Run the source local backend acceptance checks after all browser mutation tests have stopped."""
from pathlib import Path
import argparse
import datetime
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/operations/backend-evidence.json')
    args = parser.parse_args()
    commands = [
        ['supabase', 'test', 'db'],
        ['supabase', 'db', 'lint', '--local'],
        [sys.executable, 'supabase/tests/http_auth_storage_test.py'],
        ['node', 'supabase/tests/realtime_boundary_test.mjs'],
        ['npm', '--prefix', 'apps/media', 'test'],
        ['npm', '--prefix', 'apps/media', 'run', 'test:integration'],
        ['npm', '--prefix', 'apps/media', 'audit', '--omit=dev'],
        [sys.executable, 'supabase/scripts/verify_seed.py', '--output', 'docs/operations/seed-evidence.json'],
    ]
    results = []
    for command in commands:
        print('Running ' + ' '.join(command), flush=True)
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        output = result.stdout + result.stderr
        passed = result.returncode == 0 and (command[:3] != ['supabase', 'db', 'lint'] or 'No schema errors found' in output)
        results.append({'command': command, 'result': 'PASS' if passed else 'FAIL', 'output': output})
        if not passed:
            print(output)
            break
    evidence = {'executed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Local dawes-studios backend; web browser/build evidence is separate.', 'result': 'PASS' if len(results) == len(commands) and all(row['result'] == 'PASS' for row in results) else 'FAIL', 'checks': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + '\n')
    print('Backend acceptance ' + evidence['result'] + ': ' + str(args.output))
    raise SystemExit(0 if evidence['result'] == 'PASS' else 1)


if __name__ == '__main__':
    main()
