import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);
export const LIMITS = Object.freeze({
  bytes: 50 * 1024 * 1024, pixels: 40_000_000, pages: 20, pagePixels: 16_000_000, pdfPixels: 100_000_000, processMs: 30_000,
  // Video is bounded by remux time and storage cost, not by memory: a stream copy never decodes a
  // frame. The image `processMs` is far too short for a gigabyte, so video carries its own.
  //
  // `sanitizeVideo` below makes two separate `runMediaTool` calls and they do not share a bound:
  // `videoProbeMs` covers `ffprobe`, which reads only the container/stream headers off a file
  // already sitting on local disk -- no network, no frame decode -- so even a gigabyte input
  // needs seconds, not minutes; `videoProcessMs` covers `ffmpeg`'s `-c copy` remux, which moves
  // the full stream data into a fresh container and is sized for the disk-copy cost of the 1 GB
  // ceiling (`videoBytes`). Giving the probe the remux's five-minute budget hid a malformed or
  // truncated upload behind a long, silent wait instead of refusing it quickly -- exactly the
  // failure mode the probe exists to catch fast.
  videoBytes: 1024 * 1024 * 1024, videoProbeMs: 30_000, videoProcessMs: 300_000,
});
sharp.cache({ memory: 64, files: 0, items: 20 });
sharp.concurrency(2);

export class MediaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function validateSize(bytes) {
  if (!bytes.length || bytes.length > LIMITS.bytes) throw new MediaError('Files must contain between 1 byte and 50 MiB.', 413);
}

export async function sanitizeRaster(bytes) {
  validateSize(bytes);
  const pipeline = sharp(bytes, { limitInputPixels: LIMITS.pixels, failOn: 'warning', sequentialRead: true });
  let metadata;
  try { metadata = await pipeline.metadata(); } catch { throw new MediaError('The image is invalid or exceeds the pixel limit.'); }
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new MediaError('Use a single-frame PNG, JPEG or WebP image.');
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > LIMITS.pixels) throw new MediaError('The image exceeds the 40 megapixel limit.', 413);
  let output;
  try {
    // Metadata is deliberately not retained. Rotation bakes EXIF orientation into new pixels.
    output = await pipeline.rotate().toColourspace('srgb').png().timeout({ seconds: 30 }).toBuffer();
  } catch { throw new MediaError('The image could not be safely regenerated.'); }
  let mimeType = 'image/png';
  let extension = 'png';
  if (output.length > LIMITS.bytes && !metadata.hasAlpha) {
    // A photographic JPEG re-encoded as PNG can be several times its source size, so a file that
    // passed every stated limit was rejected for being too large once we had inflated it. Opaque
    // images fall back to JPEG, which still strips metadata and bakes orientation.
    try {
      output = await sharp(bytes, { limitInputPixels: LIMITS.pixels, failOn: 'warning', sequentialRead: true })
        .rotate().toColourspace('srgb').jpeg({ quality: 88, mozjpeg: true }).timeout({ seconds: 30 }).toBuffer();
    } catch { throw new MediaError('The image could not be safely regenerated.'); }
    mimeType = 'image/jpeg';
    extension = 'jpg';
  }
  if (!output.length) throw new MediaError('The image could not be safely regenerated.');
  if (output.length > LIMITS.bytes)
    throw new MediaError('The regenerated image is larger than 50 MiB. Reduce its dimensions and upload again.', 413);
  return { bytes: output, mimeType, extension };
}

async function runPdfTool(tool, args) {
  try {
    return await execFileAsync(tool, args, { timeout: LIMITS.processMs, maxBuffer: 256 * 1024, env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, windowsHide: true });
  } catch { throw new MediaError('The PDF could not be rendered within the supported limits.'); }
}

export async function sanitizePdf(bytes) {
  validateSize(bytes);
  if (!bytes.subarray(0, 8).includes(Buffer.from('%PDF-'))) throw new MediaError('The file is not a PDF.');
  const directory = await mkdtemp(join(tmpdir(), 'dawes-media-'));
  const deadline = Date.now() + 90_000;
  try {
    const source = join(directory, 'source.pdf');
    await writeFile(source, bytes, { mode: 0o600 });
    // Poppler parses untrusted source files in a bounded child process. Original PDF objects
    // (metadata, forms, scripts, attachments, hidden text and links) are never copied.
    const { stdout: summary } = await runPdfTool('pdfinfo', [source]);
    const pageCount = Number(summary.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!pageCount || pageCount > LIMITS.pages) throw new MediaError('PDFs must contain between 1 and 20 pages.', 413);
    if (/^Encrypted:\s+yes/m.test(summary)) throw new MediaError('Encrypted PDFs are not supported.');
    const { stdout: details } = await runPdfTool('pdfinfo', ['-f', '1', '-l', String(pageCount), source]);
    const dimensions = [...details.matchAll(/^Page\s+\d+ size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gm)].map(match => [Number(match[1]), Number(match[2])]);
    if (dimensions.length !== pageCount) throw new MediaError('PDF page dimensions could not be validated.');
    const output = await PDFDocument.create();
    output.setProducer('Dawes Studio'); output.setCreator('Dawes Studio');
    output.setAuthor('Studio'); output.setTitle('Creative delivery');
    let totalPixels = 0;
    for (let page = 1; page <= pageCount; page++) {
      if (Date.now() > deadline) throw new MediaError('PDF processing exceeded the time limit.', 413);
      let [width, height] = dimensions[page - 1];
      const rotation = Number(details.match(new RegExp(`^Page\\s+${page} rot:\\s+(-?\\d+)`, 'm'))?.[1] ?? 0);
      if (Math.abs(rotation % 180) === 90) [width, height] = [height, width];
      const pixels = Math.ceil(width * 2) * Math.ceil(height * 2);
      totalPixels += pixels;
      if (width <= 0 || height <= 0 || pixels > LIMITS.pagePixels || totalPixels > LIMITS.pdfPixels) throw new MediaError('PDF page dimensions exceed the rendering limit.', 413);
      const prefix = join(directory, `page-${page}`);
      await runPdfTool('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', '144', '-png', source, prefix]);
      const raster = await sanitizeRaster(await readFile(prefix + '.png'));
      const embedded = await output.embedPng(raster.bytes);
      output.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
      await rm(prefix + '.png');
    }
    const result = Buffer.from(await output.save());
    validateSize(result);
    return { bytes: result, mimeType: 'application/pdf', extension: 'pdf' };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/**
 * Runs ffprobe or ffmpeg with a scrubbed environment and a hard time budget. A tool that exits with
 * an error has rejected the content, which is the caller's `failureStatus`. A tool this process
 * killed because its budget ran out has not judged the file at all, so it is a 504 the browser may
 * retry, never a verdict that discards the raw upload.
 */
export async function runMediaTool(tool, args, timeoutMs, failure, failureStatus = 400, signal) {
  try {
    return await execFileAsync(tool, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }, windowsHide: true, signal });
  } catch (error) {
    if (error?.killed && error.name !== 'AbortError') throw new MediaError('The video took too long to process. Try again.', 504);
    throw new MediaError(failure, failureStatus);
  }
}

const videoCodecs = Object.freeze({ 'video/mp4': ['h264'], 'video/webm': ['vp8', 'vp9', 'av1'] });

/**
 * Reads a video's codec, dimensions and duration without touching its bytes beyond the container
 * headers. Split out of `sanitizeVideo` so the idempotent-retry path (server.js) can re-derive the
 * response's `{durationSeconds, width, height}` for an already-sanitized object without running
 * ffmpeg again -- "without running ffmpeg again" is the literal requirement; ffprobe still runs,
 * bounded by the same LIMITS.videoProbeMs budget either way.
 *
 * ffprobe failing to read the container, or the container missing the dimensions/duration a player
 * needs, is content ffmpeg or ffprobe rejects -- it can never succeed on retry -- so both return
 * 422. A codec that does not match the declared MIME type is the type check, and stays 415.
 */
export async function probeVideo(inputPath, mimeType, signal) {
  const codecs = videoCodecs[mimeType];
  if (!codecs) throw new MediaError('Upload an MP4 or WebM video.', 415);
  const { stdout } = await runMediaTool('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration',
    '-of', 'json', inputPath,
  ], LIMITS.videoProbeMs, 'The video could not be read.', 422, signal);
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream || !codecs.includes(stream.codec_name))
    throw new MediaError('The file is not a playable MP4 or WebM video.', 415);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const durationSeconds = Number(probe.format?.duration);
  if (!width || !height || !Number.isFinite(durationSeconds))
    throw new MediaError('The video is missing the dimensions or duration a player needs.', 422);
  return { durationSeconds, width, height };
}

/**
 * Strips every container tag, per-stream tag, chapter and timecode/attachment track from a
 * web-playable video and writes a clean copy.
 *
 * This is a **remux, not a transcode**: `-c copy` moves the existing streams into a fresh
 * container, so it is bounded by disk rather than CPU and a gigabyte takes seconds. The product
 * accepts only formats a browser plays, which is what makes that possible.
 *
 * Metadata removal is the point. Images get it as a side effect of the canvas re-encode in the
 * browser and again from `sanitizeRaster`; video has no browser-side equivalent, and the client
 * snapshot is immutable, so whatever rides along cannot be withdrawn later. Both `-map_metadata
 * -1` (container/format tags) and `-map_metadata:s -1` (per-stream tags — handler names,
 * language, GPS, device fields some cameras attach to the video stream itself, not just the
 * format) are passed explicitly: specifying either one alone still happens to suppress the other
 * as an ffmpeg side effect, but that is emergent behaviour, not a documented guarantee, and a
 * future ffmpeg base-image bump could silently reintroduce stream-level leakage if only one flag
 * were present.
 *
 * `maxBytes` defaults to `LIMITS.videoBytes` and exists as a parameter — rather than requiring
 * callers to mutate `LIMITS` — because `LIMITS` is frozen with `Object.freeze`, which also makes
 * its properties non-configurable: `Object.defineProperty` cannot override a frozen ceiling even
 * with `configurable: true` in the descriptor, so tests need a seam that does not touch the
 * shared, frozen object.
 *
 * **Contract for callers.** `inputPath` and `outputPath` are trusted as given — this function
 * does not create, own or clean up a working directory the way `sanitizePdf` does. The only
 * cleanup it performs is removing a partial `outputPath` if the ffmpeg step itself fails (for
 * example because its timeout fires mid-remux, which can otherwise leave a truncated but
 * structurally valid, playable video behind); a failed probe step never writes to `outputPath` at
 * all, so nothing is unlinked for it. On success the file at `outputPath` is left in place for the
 * caller to move, upload or delete; on any other failure (bad size, bad mime, unreadable input)
 * the caller's `inputPath` is left untouched and `outputPath` is never created.
 */
export async function sanitizeVideo(inputPath, outputPath, mimeType, maxBytes = LIMITS.videoBytes, signal) {
  const { size } = await stat(inputPath);
  if (!size || size > maxBytes)
    throw new MediaError('Videos must be between 1 byte and 1 gigabyte.', 413);

  // Probe before touching the file: a container that does not hold what its type claims is
  // refused rather than remuxed into something that still will not play.
  const probe = await probeVideo(inputPath, mimeType, signal);

  const args = [
    '-v', 'error', '-nostdin', '-y', '-i', inputPath,
    '-map_metadata', '-1', '-map_metadata:s', '-1', '-map_chapters', '-1', '-c', 'copy',
  ];
  // faststart moves the index to the front so playback can begin before the whole file arrives.
  // It is an MP4 container feature; WebM is already streamable.
  if (mimeType === 'video/mp4') args.push('-movflags', '+faststart');
  args.push(outputPath);

  try {
    await runMediaTool('ffmpeg', args, LIMITS.videoProcessMs, 'The video could not be safely regenerated.', 422, signal);
  } catch (error) {
    // A timeout (or any other ffmpeg failure) can still leave a truncated but structurally valid,
    // playable file at outputPath — the process is killed mid-write, not before it starts writing.
    // A caller that checks for the file's existence rather than catching this rejection would
    // otherwise treat that fragment as a successfully sanitised artifact.
    await unlink(outputPath).catch(unlinkError => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
    throw error;
  }
  return probe;
}

export async function sanitizeDelivery(bytes, mimeType) {
  if (mimeType === 'application/pdf') return sanitizePdf(bytes);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return sanitizeRaster(bytes);
  throw new MediaError('Delivery supports PNG, JPEG, WebP and PDF files only.', 415);
}
