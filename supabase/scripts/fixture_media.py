"""Deterministic, explicitly synthetic media used only by local acceptance fixtures."""
import html
import struct
import zlib


def png_card(index, *, internal=False):
    width,height=640,480
    paper=(243,242,236);ink=(35,42,35);accent=(145+(index*7)%50,164+(index*3)%35,123+(index*11)%65)
    rows=[]
    for y in range(height):
        row=bytearray()
        for x in range(width):
            color=paper
            if 52<=x<588 and 52<=y<428:color=accent
            if 110<=x<530 and 110<=y<360:color=ink
            if 135<=x<430 and 145<=y<159:color=paper
            if 135<=x<365 and 175<=y<189:color=paper
            if 135<=x<235 and 300<=y<316:color=accent
            row.extend(color)
        rows.append(b'\x00'+row)
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    metadata=chunk(b'tEXt',b'Author\x00Private production designer') if internal else b''
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+metadata+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')


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
    rectangles = [(0,0,640,480,paper), (184,88,272,272,ink)]
    scale=14; start=(640-(len(initials)*6-1)*scale)//2
    for position, letter in enumerate(initials):
        for row, pattern in enumerate(glyphs[letter]):
            for column, pixel in enumerate(pattern):
                if pixel=='1':rectangles.append((start+(position*6+column)*scale,175+row*scale,scale,scale,paper))
    return rectangles


def monogram_png(name):
    width,height=640,480
    pixels=bytearray(width*height*3)
    for x,y,w,h,color in compact_mark_rectangles(name):
        for row in range(y,y+h):pixels[(row*width+x)*3:(row*width+x+w)*3]=bytes(color)*w
    scanlines=b''.join(b'\x00'+pixels[row*width*3:(row+1)*width*3] for row in range(height))
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scanlines,9))+chunk(b'IEND',b'')


def monogram_pdf(name):
    commands=[]
    for x,y,w,h,color in compact_mark_rectangles(name):
        commands.append(' '.join(f'{value/255:.6f}' for value in color)+f' rg {x} {480-y-h} {w} {h} re f')
    stream='\n'.join(commands).encode()
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 480] /Contents 4 0 R >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
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
