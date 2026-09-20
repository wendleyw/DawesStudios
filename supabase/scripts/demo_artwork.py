"""Replace the local fixture artwork with real photographs, for looking at a populated board.

This is a demonstration overlay, not part of the acceptance baseline. The checked-in fixtures stay
deterministic and explicitly synthetic: `build_seed.py` and `fixture_media.py` are untouched, nothing
is added to the repository, and `local_stack.py reset` restores the synthetic artwork. Run this after
a reset, and after `verify_seed.py`, which compares production artwork byte for byte against the
generated cards and will fail once those bytes are photographs.

Only the production artwork in `internal-assets` is replaced, which is what the agency and the
assigned designer read on the board and inside a project. The published copies a client reads are
left alone on purpose: a publication is an immutable client snapshot, and `register_sanitized_asset`
refuses to re-describe an existing path with different bytes. To see a photograph on the client side,
publish a new version through the product rather than rewriting one behind it.

The replacement keeps the property the fixtures exist to prove: the private copy carries producer
identity in an `Author` text chunk, which the sanitizer is what removes.

Photographs come from picsum.photos, which serves Unsplash images at a stable id and crops them to
the exact canvas each deliverable was ordered in. They are placeholders for looking at layout, not
approved client material.

    python3 supabase/scripts/demo_artwork.py
"""
import argparse
import io
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixture_media import chunk, png_pixel_size

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'https://picsum.photos/id/{photo}/{width}/{height}'
# A fixed spread of picsum ids, so the same design shows the same photograph on every run and no two
# pieces of work on a board repeat one. Ids are stable; the photographs behind them are not ours.
PHOTO_IDS = [
    1015, 1016, 1018, 1019, 1024, 1025, 1027, 1033, 1035, 1039,
    1043, 1044, 1047, 1050, 1059, 1060, 1062, 1067, 1069, 1074,
    1080, 111, 145, 163, 180, 201, 225,
]
# The marker `fixture_media.png_card` writes into the private copy, kept identical here so the
# internal and published copies still differ in exactly the way the fixtures assert they do.
AUTHOR_CHUNK = chunk(b'tEXt', b'Author\x00Private production designer')


def environment():
    text = (ROOT / 'supabase/.env.local').read_text()
    values = dict(line.split('=', 1) for line in text.strip().split('\n') if '=' in line and not line.startswith('#'))
    missing = [key for key in ('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY') if key not in values]
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
    """One photograph as a PNG at exactly the canvas its deliverable was ordered in.

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


def with_author(content):
    """The private copy, carrying producer identity immediately after the header."""
    end_of_header = 8 + 8 + 13 + 4
    return content[:end_of_header] + AUTHOR_CHUNK + content[end_of_header:]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--limit', type=int, help='Replace only the first N production images, for a quick look.')
    arguments = parser.parse_args()

    values = environment()
    api, anon, service = values['SUPABASE_URL'], values['SUPABASE_ANON_KEY'], values['SUPABASE_SERVICE_ROLE_KEY']
    fixtures = json.loads((ROOT / 'supabase/fixtures.json').read_text())

    def call(path, payload=None, content=None, content_type='application/json', headers=None):
        data = content if content is not None else (json.dumps(payload).encode() if payload is not None else None)
        request = urllib.request.Request(api + path, data=data, headers={
            'apikey': anon, 'Authorization': 'Bearer ' + service, 'Content-Type': content_type, **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            raise SystemExit(f'{path} failed with HTTP {error.code}: {error.read().decode()[:400]}')

    assets = fixtures['working_assets'][: arguments.limit] if arguments.limit else fixtures['working_assets']
    published = 0
    for position, asset in enumerate(assets):
        photo = PHOTO_IDS[position % len(PHOTO_IDS)]
        content = photograph(photo, asset['width'], asset['height'])
        call('/storage/v1/object/internal-assets/' + asset['source_path'], content=with_author(content),
             content_type='image/png', headers={'x-upsert': 'true'})
        published += 1 if asset['published_path'] else 0
        print(f'  {position + 1:>2}/{len(assets)}  photo {photo:<5} {asset["width"]}x{asset["height"]}', flush=True)

    print(f'Replaced {len(assets)} production images with photographs.')
    print(f'{published} published client snapshots were left as they are; a publication is immutable.')
    print('This is a local demonstration overlay. Run local_stack.py reset to restore the deterministic fixtures.')


if __name__ == '__main__':
    main()
