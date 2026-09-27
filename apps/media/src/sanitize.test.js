import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { LIMITS, sanitizeCover, sanitizeDelivery, sanitizePdf, sanitizeRaster } from './sanitize.js';

describe('trusted raster regeneration', () => {
  it('preserves pixels while removing EXIF creator metadata', async () => {
    const input = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#aa7744' } }).jpeg().withExif({ IFD0: { Artist: 'PRIVATE DESIGNER', Copyright: 'SECRET CREATOR' } }).toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await sanitizeRaster(input);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe('png'); expect(metadata.width).toBe(32); expect(metadata.height).toBe(24);
    expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(result.bytes.includes(Buffer.from('PRIVATE DESIGNER'))).toBe(false);
  });
  it('rejects SVG and corrupt data regardless of the filename or declared type', async () => {
    await expect(sanitizeRaster(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).rejects.toThrow('single-frame');
    await expect(sanitizeRaster(Buffer.from('not an image'))).rejects.toThrow('invalid');
  });
  it('rejects oversized pixel canvases before decoding their contents', async () => {
    const input = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(sanitizeRaster(input)).rejects.toThrow('pixel limit');
  });
  it('keeps a photographic upload that PNG would inflate past the byte limit', async () => {
    // A 24 MP JPEG sits inside every stated limit, but re-encoding it as PNG produced ~57 MiB and
    // the file was rejected with a message blaming the upload. Opaque images fall back to JPEG.
    const pixels = Buffer.alloc(6000 * 4000 * 3);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 2654435761) % 251;
    const input = await sharp(pixels, { raw: { width: 6000, height: 4000, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    expect((await sharp(input).png().toBuffer()).length).toBeGreaterThan(LIMITS.bytes);
    const result = await sanitizeRaster(input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.bytes.length).toBeLessThanOrEqual(LIMITS.bytes);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.width).toBe(6000);
    expect(metadata.height).toBe(4000);
    expect(metadata.exif).toBeUndefined();
  }, 60_000);

  it('keeps transparency as PNG rather than flattening it into the fallback', async () => {
    const input = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.4 } } }).png().toBuffer();
    const result = await sanitizeRaster(input);
    expect(result.mimeType).toBe('image/png');
    expect((await sharp(result.bytes).metadata()).hasAlpha).toBe(true);
  });

  it('rejects unsupported delivery types', async () => {
    await expect(sanitizeDelivery(Buffer.from('video'), 'video/mp4')).rejects.toThrow('PNG, JPEG, WebP and PDF');
  });
});

describe('sanitizeCover', () => {
  it('re-encodes a PNG, JPEG or WebP source to PNG while removing EXIF creator metadata', async () => {
    const input = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#aa7744' } }).jpeg().withExif({ IFD0: { Artist: 'PRIVATE DESIGNER' } }).toBuffer();
    const result = await sanitizeCover(input);
    expect(result.mimeType).toBe('image/png');
    expect(result.extension).toBe('png');
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe('png'); expect(metadata.width).toBe(32); expect(metadata.height).toBe(24);
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects SVG and corrupt data regardless of the filename or declared type', async () => {
    await expect(sanitizeCover(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).rejects.toThrow('single-frame');
    await expect(sanitizeCover(Buffer.from('not an image'))).rejects.toThrow('invalid');
  });

  it('rejects oversized pixel canvases before decoding their contents', async () => {
    const input = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(sanitizeCover(input)).rejects.toThrow('pixel limit');
  });

  // `sanitizeRaster` falls back to JPEG for exactly this input (see "keeps a photographic upload"
  // above) because a delivery may be either format. A cover bucket accepts PNG only, so this must
  // refuse rather than silently produce a mime type the database would reject.
  it('refuses a photographic upload whose PNG re-encode would exceed the byte limit, rather than falling back to JPEG', async () => {
    const pixels = Buffer.alloc(6000 * 4000 * 3);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 2654435761) % 251;
    const input = await sharp(pixels, { raw: { width: 6000, height: 4000, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    expect((await sharp(input).png().toBuffer()).length).toBeGreaterThan(LIMITS.bytes);
    await expect(sanitizeCover(input)).rejects.toMatchObject({ status: 413 });
  }, 60_000);

  it('keeps transparency as PNG', async () => {
    const input = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.4 } } }).png().toBuffer();
    const result = await sanitizeCover(input);
    expect(result.mimeType).toBe('image/png');
    expect((await sharp(result.bytes).metadata()).hasAlpha).toBe(true);
  });
});

describe('trusted PDF regeneration', () => {
  it('preserves page sizes and visible content while dropping author, scripts and attachments', async () => {
    const source = await PDFDocument.create();
    source.setAuthor('PRIVATE DESIGNER'); source.setSubject('INTERNAL NOTES'); source.setTitle('Private draft');
    source.addJavaScript('private', 'app.alert("PRIVATE DESIGNER");');
    await source.attach(Buffer.from('PRIVATE SOURCE FILE'), 'designer-notes.txt');
    const font = await source.embedFont(StandardFonts.Helvetica);
    source.addPage([612, 792]).drawText('Visible approved artwork', { x: 50, y: 700, font, size: 20 });
    source.addPage([400, 300]).drawText('Second approved page', { x: 20, y: 200, font, size: 15 });
    const result = await sanitizePdf(Buffer.from(await source.save()));
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(2); expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }, { width: 400, height: 300 }]);
    expect(pdf.getAuthor()).toBe('Studio'); expect(pdf.getSubject()).toBeUndefined(); expect(result.bytes.includes(Buffer.from('PRIVATE DESIGNER'))).toBe(false);
    expect(pdf.catalog.has(pdf.context.obj('Names'))).toBe(false);
    expect(pdf.catalog.has(pdf.context.obj('OpenAction'))).toBe(false);
  }, 30_000);
  it('rejects documents above the page limit', async () => {
    const source = await PDFDocument.create(); for (let i = 0; i < 21; i++) source.addPage([100, 100]);
    await expect(sanitizePdf(Buffer.from(await source.save()))).rejects.toThrow('20 pages');
  });
  it('rejects oversized page dimensions and corrupt PDFs', async () => {
    const source = await PDFDocument.create(); source.addPage([10000, 10000]);
    await expect(sanitizePdf(Buffer.from(await source.save()))).rejects.toThrow('dimensions');
    await expect(sanitizePdf(Buffer.from('%PDF-invalid'))).rejects.toThrow('rendered');
  });
});

