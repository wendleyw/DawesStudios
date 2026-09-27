"""Replace the local fixture project covers with real photographs, for looking at a populated board.

This is a demonstration overlay, not part of the acceptance baseline. The checked-in fixtures stay
deterministic and explicitly synthetic: `build_seed.py` and `fixture_media.py` are untouched and
nothing is added to the repository. A cover is what a board card and the project header show, so
it is the one image worth replacing.

Every photograph goes through the media worker's `/covers/prepare` route under the agency session,
exactly like a cover the studio uploads: the worker sanitizes and attests it, `set_project_cover`
replaces the previous cover and keeps its client visibility, and the worker discards the old
object. `verify_seed.py` still passes afterwards, because it checks a cover's canvas and the absence
of producer metadata rather than its bytes. A later `local_stack.py start` keeps the photographs;
only a full reset brings the synthetic cards back.

Photographs come from picsum.photos, which serves Unsplash images at a stable id and crops them to
the exact canvas of each project's leading deliverable. They are placeholders for looking at
layout, not approved client material.

    npm run db:covers:photos
"""
import argparse
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixture_media import png_pixel_size

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'https://picsum.photos/id/{photo}/{width}/{height}'
# A fixed spread of picsum ids, so the same project shows the same photograph on every run and no two
# covers on a board repeat one. Ids are stable; the photographs behind them are not ours.
PHOTO_IDS = [
    1015, 1016, 1018, 1019, 1024, 1025, 1027, 1033, 1035, 1039,
    1043, 1044, 1047, 1050, 1059, 1060, 1062, 1067, 1069, 1074,
    1080, 111, 145, 163, 180, 201, 225,
]


def environment():
    text = (ROOT / 'supabase/.env.local').read_text()
    values = dict(line.split('=', 1) for line in text.strip().split('\n') if '=' in line and not line.startswith('#'))
    missing = [key for key in ('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DEMO_PASSWORD', 'DEMO_AGENCY_EMAIL') if key not in values]
    if missing:
        raise SystemExit('supabase/.env.local is missing ' + ', '.join(missing) + '. Start the local stack first.')
    return values


def fetch(url, attempts=3):
    """Download over HTTPS with curl, which trusts the system keychain.

    A framework Python on macOS ships without a certificate bundle, so `urllib` cannot verify a
    public host at all here. Shelling out to curl keeps verification on rather than turning it off,
    and the Supabase calls below still go through urllib because they are local and plain HTTP.
    """
    for attempt in range(attempts):
        result = subprocess.run(['curl', '-sSLf', '--max-time', '45', url], capture_output=True)
        if result.returncode == 0 and result.stdout:
            return result.stdout
        if attempt == attempts - 1:
            raise SystemExit(f'Could not download {url}: {result.stderr.decode().strip() or "empty response"}')
    raise SystemExit('unreachable')


def photograph(photo, width, height):
    """One photograph as a PNG at exactly the canvas of the project's leading deliverable.

    picsum crops server side, so the requested size is the size that comes back; the PNG is written
    locally rather than being checked in, which is why the encoder's version does not have to be
    pinned for the bytes to be usable.
    """
    from PIL import Image

    image = Image.open(io.BytesIO(fetch(SOURCE.format(photo=photo, width=width, height=height))))
    image = image.convert('RGB')
    if image.size != (width, height):
        image = image.resize((width, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    content = buffer.getvalue()
    if png_pixel_size(content) != (width, height):
        raise SystemExit(f'Rendered photograph is {png_pixel_size(content)}, not {(width, height)}')
    return content


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--limit', type=int, help='Replace only the first N covers, for a quick look.')
    arguments = parser.parse_args()

    values = environment()
    api, anon, service = values['SUPABASE_URL'], values['SUPABASE_ANON_KEY'], values['SUPABASE_SERVICE_ROLE_KEY']
    media = os.environ.get('MEDIA_URL', 'http://127.0.0.1:55430')
    fixtures = json.loads((ROOT / 'supabase/fixtures.json').read_text())

    def call(url, payload=None, content=None, token=None, content_type='application/json'):
        data = content if content is not None else (json.dumps(payload).encode() if payload is not None else None)
        request = urllib.request.Request(url, data=data, headers={
            'apikey': anon, 'Authorization': 'Bearer ' + (token or service), 'Content-Type': content_type})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read() or b'null')
        except urllib.error.HTTPError as error:
            raise SystemExit(f'{url.split("?")[0]} failed with HTTP {error.code}: {error.read().decode()[:400]}')
        except urllib.error.URLError:
            raise SystemExit(f'{url.split("?")[0]} is not reachable. Start the local stack and its media worker first.')

    session = call(api + '/auth/v1/token?grant_type=password', {'email': values['DEMO_AGENCY_EMAIL'], 'password': values['DEMO_PASSWORD']})
    covers = fixtures['covers'][: arguments.limit] if arguments.limit else fixtures['covers']
    replaced = 0
    for position, cover in enumerate(covers):
        current = call(f"{api}/rest/v1/project_covers?select=client_visible&project_id=eq.{cover['project_id']}")
        if not current:
            print(f'  {position + 1:>2}/{len(covers)}  skipped: the project has no cover (provision it first)', flush=True)
            continue
        photo = PHOTO_IDS[position % len(PHOTO_IDS)]
        content = photograph(photo, cover['width'], cover['height'])
        visible = 'true' if current[0]['client_visible'] else 'false'
        call(f"{media}/covers/prepare?projectId={cover['project_id']}&visible={visible}", content=content,
             token=session['access_token'], content_type='image/png')
        replaced += 1
        print(f'  {position + 1:>2}/{len(covers)}  photo {photo:<5} {cover["width"]}x{cover["height"]}', flush=True)

    print(f'Replaced {replaced} project covers with photographs through the media worker.')
    print('This is a local demonstration overlay; only a full reset restores the synthetic cards.')


if __name__ == '__main__':
    main()
