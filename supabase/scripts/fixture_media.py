"""Deterministic, explicitly synthetic media used only by local acceptance fixtures."""
import html
import struct
import zlib

MILLIMETRES_PER_INCH = 25.4
# A print format is measured in millimetres, so it has a real size but no pixel canvas. Rendering it at
# 150 DPI keeps the proportions exact and stays readable on screen without producing a press-resolution
# file: A4 becomes 1240x1754, which is already the size of the seeded `Print Flyer` brand template.
PRINT_PROOF_DPI = 150
# Document and kit formats (`brand-kit`, `guidelines`, `research`, `shot-list`, `direction`, `dieline`,
# `custom`) declare no canvas at all, and neither does a brand product reference. Both render as a
# 1080x1080 square cover card: the 1080 baseline shared with the smallest fixed digital format, in a
# neutral aspect ratio that claims no shape the deliverable has not actually been ordered in.
FORMAT_FREE_SIZE = (1080, 1080)
# A fluid web or email format fixes only its width. The fixture gives it a 3:4 portrait canvas, the
# shape of the first screen of a layout that keeps scrolling past it.
FLUID_ASPECT = 4 / 3
# The card composition is held in fractions of its canvas so that it survives any aspect ratio. At
# 640x480 these fractions round back to the pixel bounds the fixed-size card used before.
CARD_LAYOUT = (((.081, .919), (.108, .892), 'accent'), ((.172, .828), (.229, .750), 'ink'), ((.211, .672), (.302, .331), 'paper'), ((.211, .570), (.365, .394), 'paper'), ((.211, .367), (.625, .658), 'accent'))
MARK_SIZE = (640, 480)


def format_pixel_size(definition):
    """The pixel canvas one entry of the format catalog is rendered at.

    Fixture artwork carries the true size of the format its deliverable was ordered in, so the board
    and the project canvas show every piece in the shape it will really be delivered in. The two
    format families that carry no pixel size resolve through the rules documented above.
    """
    width, height = definition.get('width'), definition.get('height')
    if definition.get('unit') == 'mm' and width and height:
        scale = PRINT_PROOF_DPI / MILLIMETRES_PER_INCH
        return round(width * scale), round(height * scale)
    if definition.get('unit') == 'px' and width:
        return width, height or round(width * FLUID_ASPECT)
    return FORMAT_FREE_SIZE


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


# The producer-identity marker a private working file carries and a sanitizer strips. Shared with
# `demo_artwork.py`, which stamps the same marker onto photographs it substitutes for these cards, so
# the two sources of internal artwork carry identical bytes for the same claim rather than two
# literals that could drift apart.
AUTHOR_TEXT_CHUNK = chunk(b'tEXt', b'Author\x00Private production designer')


def png_card(index, width, height, *, internal=False):
    """A deterministic card drawn at an explicit pixel size; the index keeps every card distinguishable.

    Rows are painted as flat runs, identical rows are built once and repeated, and the scanlines are
    streamed into the compressor, so a 1080x1920 canvas costs a handful of memory copies instead of two
    million Python iterations and never holds a six megabyte buffer.
    """
    paper = (243, 242, 236)
    ink = (35, 42, 35)
    accent = (145 + (index * 7) % 50, 164 + (index * 3) % 35, 123 + (index * 11) % 65)
    tones = {'paper': paper, 'ink': ink, 'accent': accent}
    bands = [((round(width * left), min(width, round(width * right))), (round(height * top), round(height * bottom)), bytes(tones[tone])) for (left, right), (top, bottom), tone in CARD_LAYOUT]
    compressor = zlib.compressobj(9)
    body = bytearray()
    rows = {}
    for y in range(height):
        key = tuple(number for number, (_, (top, bottom), _) in enumerate(bands) if top <= y < bottom)
        row = rows.get(key)
        if row is None:
            pixels = bytearray(bytes(paper) * width)
            for number in key:
                (left, right), _, color = bands[number]
                if right > left: pixels[left * 3:right * 3] = color * (right - left)
            row = rows[key] = b'\x00' + bytes(pixels)
        body += compressor.compress(row)
    body += compressor.flush()
    metadata = AUTHOR_TEXT_CHUNK if internal else b''
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + metadata + chunk(b'IDAT', bytes(body)) + chunk(b'IEND', b'')


def png_pixel_size(content):
    """The width and height a PNG actually declares in its IHDR header."""
    if content[:8] != b'\x89PNG\r\n\x1a\n' or content[12:16] != b'IHDR': raise ValueError('Not a PNG file')
    return struct.unpack('>II', content[16:24])


def monogram_svg(name):
    initials=''.join(word[0] for word in name.split() if word[0].isalpha())[:2]
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#f3f2ec"/><rect x="184" y="88" width="272" height="272" rx="20" fill="#232a23"/><text x="320" y="265" text-anchor="middle" font-family="Arial,sans-serif" font-size="104" fill="#f3f2ec">{html.escape(initials)}</text><text x="320" y="410" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#232a23">Sample brand mark</text></svg>'.encode()


def compact_mark_rectangles(name):
    """A self-contained pixel monogram variant, independent of installed system fonts."""
    glyphs = {
        'A': ['01110','10001','10001','11111','10001','10001','10001'],
        'B': ['11110','10001','10001','11110','10001','10001','11110'],
        'F': ['11111','10000','10000','11110','10000','10000','10000'],
        'H': ['10001','10001','10001','11111','10001','10001','10001'],
        'K': ['10001','10010','10100','11000','10100','10010','10001'],
        'N': ['10001','11001','11001','10101','10011','10011','10001'],
        'O': ['01110','10001','10001','10001','10001','10001','01110'],
        'P': ['11110','10001','10001','11110','10000','10000','10000'],
        'R': ['11110','10001','10001','11110','10100','10010','10001'],
        'S': ['01111','10000','10000','01110','00001','00001','11110'],
        'V': ['10001','10001','10001','10001','10001','01010','00100'],
    }
    initials = ''.join(word[0] for word in name.split() if word[0].isalpha())[:2].upper()
    paper, ink = (243,242,236), (35,42,35)
    width, height = MARK_SIZE
    rectangles = [(0,0,width,height,paper), (184,88,272,272,ink)]
    scale=14; start=(width-(len(initials)*6-1)*scale)//2
    for position, letter in enumerate(initials):
        for row, pattern in enumerate(glyphs[letter]):
            for column, pixel in enumerate(pattern):
                if pixel=='1':rectangles.append((start+(position*6+column)*scale,175+row*scale,scale,scale,paper))
    return rectangles


def monogram_png(name):
    # A brand mark is a logo, not a deliverable: it belongs to no format and stays at the one size its
    # SVG and PDF siblings also use, so the three files of a client's mark remain the same artwork.
    width,height=MARK_SIZE
    pixels=bytearray(width*height*3)
    for x,y,w,h,color in compact_mark_rectangles(name):
        for row in range(y,y+h):pixels[(row*width+x)*3:(row*width+x+w)*3]=bytes(color)*w
    scanlines=b''.join(b'\x00'+pixels[row*width*3:(row+1)*width*3] for row in range(height))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scanlines,9))+chunk(b'IEND',b'')


def monogram_pdf(name):
    width,height=MARK_SIZE
    commands=[]
    for x,y,w,h,color in compact_mark_rectangles(name):
        commands.append(' '.join(f'{value/255:.6f}' for value in color)+f' rg {x} {height-y-h} {w} {h} re f')
    stream='\n'.join(commands).encode()
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Contents 4 0 R >>'.encode(),b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    pdf=b'%PDF-1.4\n';offsets=[]
    for index,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(index).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(pdf);pdf+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)+b'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    return pdf


def simple_pdf(text):
    safe=text.encode('ascii','replace').decode().replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
    stream=f'BT /F1 20 Tf 54 720 Td ({safe}) Tj 0 -40 Td (Demonstration reference - replace with approved materials.) Tj ET'.encode()
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    pdf=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    return pdf


def delivery_pdf():
    """The minimal delivery PDF provisioning attaches to the approved delivery project.

    It holds only safe fixture copy and no producer identity. Shared by the local provisioning and
    the staging wrapper so both attach the same file.
    """
    stream=b'BT /F1 24 Tf 72 720 Td (Creative Canvas - approved delivery) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    pdf=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    return pdf


def brand_asset_bytes(asset):
    """The canonical bytes of one `brand_assets` entry of the fixture manifest."""
    if asset['kind']=='mark':return monogram_svg(asset['client_name'])
    if asset['kind']=='mark-png':return monogram_png(asset['client_name'])
    if asset['kind']=='mark-pdf':return monogram_pdf(asset['client_name'])
    if asset['kind']=='guidelines':return simple_pdf(asset['client_name']+' / Sample brand guidelines')
    # A product reference is rendered at the pixel canvas the manifest records for it.
    return png_card(asset['index']+int(asset['kind'][-1]),asset['width'],asset['height'])
