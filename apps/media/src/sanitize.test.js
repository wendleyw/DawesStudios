import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LIMITS, MediaError, probeVideo, runMediaTool, sanitizeCover, sanitizeDelivery, sanitizePdf, sanitizeRaster, sanitizeVideo } from './sanitize.js';

const run = promisify(execFile);

async function tagsOf(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path]);
  return JSON.parse(stdout).format?.tags ?? {};
}

async function streamTagsOf(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream_tags', '-of', 'json', path]);
  return (JSON.parse(stdout).streams ?? []).map(stream => stream.tags ?? {});
}

async function chaptersOf(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_chapters', '-of', 'json', path]);
  return JSON.parse(stdout).chapters ?? [];
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

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

describe('sanitizeVideo', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'video-test-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('removes every container tag, stream tag and chapter the source carried', async () => {
    // fixtures/tagged.mp4 carries metadata at three levels — format tags (title/comment/artist),
    // per-stream tags on the video stream (handler_name/language) and a chapter — each verified
    // present here with ffprobe before trusting any assertion about the output's absence of them.
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    expect(Object.keys(await tagsOf(input)).length).toBeGreaterThan(0);
    const inputStreamTags = await streamTagsOf(input);
    expect(inputStreamTags.some(tags => tags.handler_name === 'Custom Handler' && tags.language === 'eng')).toBe(true);
    expect((await chaptersOf(input)).length).toBeGreaterThan(0);

    const output = join(dir, 'clean.mp4');
    const probe = await sanitizeVideo(input, output, 'video/mp4');

    const tags = await tagsOf(output);
    for (const key of ['title', 'comment', 'artist']) expect(tags[key]).toBeUndefined();
    // The mp4 muxer always writes its own default handler_name ("VideoHandler") and language
    // ("und") on remux, the same way it always writes major_brand/encoder format tags — that is
    // an infrastructure fingerprint of ffmpeg itself, not source metadata, and is accepted for the
    // same reason the `encoder` format tag is. What must be gone is the source's own values.
    for (const streamTags of await streamTagsOf(output)) {
      expect(streamTags.handler_name).not.toBe('Custom Handler');
      expect(streamTags.language).not.toBe('eng');
    }
    expect(await chaptersOf(output)).toEqual([]);
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(240);
    expect(probe.durationSeconds).toBeGreaterThan(1.5);
  });

  it('refuses a file whose container does not match its declared type', async () => {
    const input = join(dir, 'liar.mp4');
    await writeFile(input, Buffer.from('this is not a video'));
    await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4')).rejects.toThrow(MediaError);
  });

  it('returns 422 for a file whose container does not match its declared type', async () => {
    const input = join(dir, 'liar.mp4');
    await writeFile(input, Buffer.from('this is not a video'));
    await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4')).rejects.toMatchObject({ status: 422 });
  });

  it('exposes probeVideo so a caller can re-probe an already-sanitized file without re-running ffmpeg', async () => {
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    const probe = await probeVideo(input, 'video/mp4');
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(240);
    expect(probe.durationSeconds).toBeGreaterThan(1.5);
  });

  it('aborts the ffmpeg remux and removes any partial output when the signal fires', async () => {
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    const output = join(dir, 'clean.mp4');
    const controller = new AbortController();
    controller.abort();
    // An abort is the caller hanging up, not a verdict on the file: it must not surface as the 422
    // that makes the route discard the raw upload for good.
    await expect(sanitizeVideo(input, output, 'video/mp4', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await exists(output)).toBe(false);
  });

  it('refuses a file over the video ceiling', async () => {
    // LIMITS is frozen with Object.freeze, which also makes its properties non-configurable, so
    // Object.defineProperty cannot redefine videoBytes even with `configurable: true` in the
    // descriptor (that itself is the property JS refuses to flip on a frozen object). sanitizeVideo
    // therefore takes the ceiling as an optional fourth argument defaulting to LIMITS.videoBytes,
    // which this test overrides directly instead of mutating the frozen object.
    const input = join(dir, 'huge.mp4');
    await writeFile(input, Buffer.alloc(16));
    await expect(sanitizeVideo(input, join(dir, 'out.mp4'), 'video/mp4', 8)).rejects.toThrow(/gigabyte|larger/i);
  });

  it('removes a stale or partial output file when the remux step itself fails', async () => {
    // A killed or otherwise failed ffmpeg process can leave a truncated but structurally valid,
    // playable file at outputPath — the process dies mid-write, not before it starts writing. A
    // caller that checks for the file's existence rather than catching the rejection would
    // otherwise treat that fragment as a successfully sanitised artifact reaching the client.
    //
    // This reproduces a real ffmpeg-step failure (not the earlier probe/size checks, which never
    // reach the ffmpeg invocation at all) deterministically and fast: an output extension ffmpeg
    // cannot pick a muxer for causes ffmpeg to exit non-zero without ever writing outputPath, so a
    // file pre-existing at that path — standing in for a real truncated remnant — proves the catch
    // path actually unlinks it rather than leaving it behind.
    const input = resolve(import.meta.dirname, 'fixtures/tagged.mp4');
    const output = join(dir, 'clean.unrecognized-extension');
    await writeFile(output, Buffer.from('a truncated remnant from an earlier, killed remux'));
    expect(await exists(output)).toBe(true);

    await expect(sanitizeVideo(input, output, 'video/mp4')).rejects.toThrow(MediaError);

    expect(await exists(output)).toBe(false);
  });
});

// A tool that is killed because its time budget ran out has not judged the file at all, so it is a
// transient failure (504, retried) rather than content the tool rejected (the caller's failure
// status, 422 for video, which discards the raw upload for good).
describe('runMediaTool', () => {
  it('reports a tool killed by its time budget as a timeout, not as the content failure', async () => {
    await expect(runMediaTool('sleep', ['5'], 50, 'The video could not be read.', 422)).rejects.toMatchObject({ status: 504 });
  });

  it('reports a tool stopped by its abort signal as an abort, not as the content failure', async () => {
    const controller = new AbortController();
    const running = runMediaTool('sleep', ['5'], 5_000, 'The video could not be read.', 422, controller.signal);
    controller.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports a tool that exits with an error as the caller-supplied content failure', async () => {
    await expect(runMediaTool('false', [], 5_000, 'The video could not be read.', 422)).rejects.toMatchObject({ status: 422, message: 'The video could not be read.' });
  });
});
