import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);
export const LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, pixels: 40_000_000, pages: 20, pagePixels: 16_000_000, pdfPixels: 100_000_000, processMs: 30_000 });
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
  validateSize(output);
  return { bytes: output, mimeType: 'image/png', extension: 'png' };
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

export async function sanitizeDelivery(bytes, mimeType) {
  if (mimeType === 'application/pdf') return sanitizePdf(bytes);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return sanitizeRaster(bytes);
  throw new MediaError('Delivery supports PNG, JPEG, WebP and PDF files only.', 415);
}
