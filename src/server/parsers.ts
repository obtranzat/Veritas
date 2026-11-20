import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';
import { assertSafeExternalUrl, sanitizeFileName } from './security.ts';

const MAX_CRAWL_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_XML_BYTES = 15 * 1024 * 1024;

export function validateBinarySignature(
  buffer: Buffer,
  rawFileName: string,
  mimeType: string
): void {
  const safeName = sanitizeFileName(rawFileName);
  const ext = safeName.split('.').pop()?.toLowerCase() || '';

  // Block ELF, Windows PE/MZ executables, and Mach-O binaries masquerading as documents/media
  if (buffer.length >= 4) {
    const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
    const isPe = buffer[0] === 0x4d && buffer[1] === 0x5a;
    if (isElf || isPe) {
      throw new Error(`Rejected executable binary signature disguised as "${safeName}".`);
    }
  }

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`Invalid PDF header signature for "${safeName}".`);
    }
  } else if (
    ext === 'docx' ||
    ext === 'odt' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.oasis.opendocument.text'
  ) {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error(`Invalid ZIP/Office container signature for "${safeName}".`);
    }
  } else if (ext === 'png' || mimeType === 'image/png') {
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      throw new Error(`Invalid PNG magic bytes for "${safeName}".`);
    }
  } else if (ext === 'jpg' || ext === 'jpeg' || mimeType === 'image/jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error(`Invalid JPEG magic bytes for "${safeName}".`);
    }
  } else if (ext === 'webp' || mimeType === 'image/webp') {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error(`Invalid WEBP RIFF header for "${safeName}".`);
    }
  }
}

export interface ExtractedDocument {
  text: string;
  format: string;
  pageCount?: number;
}

function stripRtf(rtf: string): string {
  // Remove binary/header groups and RTF control words cleanly
  let text = rtf
    .replace(/\{\\\*[^}]*\}/g, ' ')
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object)[^}]*\}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractedDocument> {
  const safeName = sanitizeFileName(fileName);
  const ext = safeName.split('.').pop()?.toLowerCase() || '';
  validateBinarySignature(buffer, safeName, mimeType);

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const result = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text || '');
    return {
      text: text.trim(),
      format: 'PDF',
      pageCount: result.totalPages,
    };
  }

  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: (result.value || '').trim(),
      format: 'DOCX',
    };
  }

  if (ext === 'odt' || mimeType === 'application/vnd.oasis.opendocument.text') {
    const zip = await JSZip.loadAsync(buffer);
    const contentFile = zip.file('content.xml');
    if (!contentFile) {
      throw new Error('Invalid ODT archive: missing content.xml');
    }
    const contentBuf = await contentFile.async('nodebuffer');
    if (contentBuf.length > MAX_ZIP_XML_BYTES) {
      throw new Error('ODT content.xml exceeds safe uncompressed size limit.');
    }
    const contentXml = contentBuf.toString('utf8');
    const $ = cheerio.load(contentXml, { xmlMode: true });
    const paragraphs: string[] = [];
    $('text\\:p, text\\:h').each((_, el) => {
      const t = $(el).text().trim();
      if (t) paragraphs.push(t);
    });
    return {
      text: paragraphs.join('\n\n').trim(),
      format: 'ODT',
    };
  }

  if (ext === 'rtf' || mimeType === 'application/rtf' || mimeType === 'text/rtf') {
    return {
      text: stripRtf(buffer.toString('utf8')),
      format: 'RTF',
    };
  }

  // Fallback for TXT, MD, CSV, JSON, HTML, XML, logs, etc.
  const rawText = buffer.toString('utf8');
  if (ext === 'html' || ext === 'htm' || mimeType === 'text/html') {
    const $ = cheerio.load(rawText);
    $('script, style, noscript').remove();
    return {
      text: $('body').text().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
      format: 'HTML',
    };
  }

  return {
    text: rawText.trim(),
    format: ext ? ext.toUpperCase() : 'TXT',
  };
}

export interface ParsedImageMetadata {
  format: string;
  dimensions?: { width: number; height: number };
  metadataTags: Record<string, string>;
  generativeSignatures: string[];
  byteEntropy: number;
}

function computeByteEntropy(buffer: Buffer): number {
  const sample = buffer.subarray(0, Math.min(buffer.length, 65536));
  if (sample.length === 0) return 0;
  const counts = new Array<number>(256).fill(0);
  for (let i = 0; i < sample.length; i++) {
    counts[sample[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / sample.length;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

export function inspectImageBinaryMetadata(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): ParsedImageMetadata {
  const metadataTags: Record<string, string> = {};
  const generativeSignatures: string[] = [];
  let dimensions: { width: number; height: number } | undefined;
  let format = fileName.split('.').pop()?.toUpperCase() || 'IMAGE';

  // PNG inspection (magic: 89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    format = 'PNG';
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      const dataStart = offset + 8;
      const dataEnd = Math.min(buffer.length, dataStart + length);

      if (chunkType === 'IHDR' && length >= 8 && dataEnd - dataStart >= 8) {
        dimensions = {
          width: buffer.readUInt32BE(dataStart),
          height: buffer.readUInt32BE(dataStart + 4),
        };
      } else if (chunkType === 'tEXt' || chunkType === 'iTXt') {
        const chunkData = buffer.subarray(dataStart, dataEnd).toString('utf8');
        const nullIdx = chunkData.indexOf('\0');
        if (nullIdx > 0) {
          const key = chunkData.slice(0, nullIdx).trim();
          const val = chunkData.slice(nullIdx + 1).replace(/\0/g, '').trim();
          if (key && val) {
            metadataTags[key] = val.slice(0, 320);
            if (/parameters|prompt|workflow|stable|diffusion|comfy|midjourney|dall-e|imagen|novelai/i.test(`${key} ${val}`)) {
              generativeSignatures.push(`PNG ${chunkType} chunk "${key}" contains generative AI workflow metadata`);
            }
          }
        }
      } else if (chunkType === 'caBX') {
        generativeSignatures.push('C2PA Content Credentials (caBX) provenance box present');
      }

      if (chunkType === 'IEND' || offset + 12 + length <= offset) break;
      offset += 12 + length;
    }
  } else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // JPEG inspection
    format = 'JPEG';
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const segLen = buffer.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      const segData = buffer.subarray(offset + 4, Math.min(buffer.length, offset + 2 + segLen));

      // SOF0 / SOF2 dimensions
      if ((marker === 0xc0 || marker === 0xc2) && segData.length >= 5) {
        dimensions = {
          height: segData.readUInt16BE(1),
          width: segData.readUInt16BE(3),
        };
      }

      // APP1 EXIF/XMP or COM comment
      if (marker === 0xe1 || marker === 0xfe) {
        const ascii = segData.toString('latin1').replace(/[^\x20-\x7e]+/g, ' ').trim();
        if (ascii.startsWith('Exif')) {
          metadataTags['EXIF Header'] = ascii.slice(0, 220);
        } else if (ascii.includes('http://ns.adobe.com/xap')) {
          metadataTags['XMP Packet'] = ascii.slice(0, 220);
        } else if (marker === 0xfe && ascii.length > 2) {
          metadataTags['JPEG Comment'] = ascii.slice(0, 220);
        }

        const aiToolMatch = ascii.match(
          /(Stable Diffusion|Midjourney|DALL-E|ComfyUI|Automatic1111|Adobe Firefly|Imagen|Flux|Runway)/i
        );
        if (aiToolMatch) {
          generativeSignatures.push(`EXIF/XMP marker references generative engine "${aiToolMatch[1]}"`);
        }
      }
      offset += 2 + segLen;
    }
  } else if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    format = 'WEBP';
    const textDump = buffer.subarray(0, Math.min(buffer.length, 32768)).toString('latin1');
    if (textDump.includes('EXIF')) metadataTags['WEBP EXIF'] = 'Present';
    if (textDump.includes('XMP')) metadataTags['WEBP XMP'] = 'Present';
    const aiMatch = textDump.match(/(Stable Diffusion|Midjourney|DALL-E|ComfyUI|Firefly|Imagen)/i);
    if (aiMatch) {
      generativeSignatures.push(`RIFF chunk references "${aiMatch[1]}"`);
    }
  } else if (
    buffer.length >= 8 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    format = 'TIFF';
    metadataTags['Byte Order'] = buffer[0] === 0x49 ? 'Little-Endian (II)' : 'Big-Endian (MM)';
  }

  if (!metadataTags['EXIF Header'] && !metadataTags['WEBP EXIF'] && format !== 'PNG') {
    metadataTags['Camera EXIF'] = 'Stripped or absent (common in AI exports and social re-encodes)';
  }
  metadataTags['MIME Type'] = mimeType;
  metadataTags['File Size'] = `${(buffer.length / 1024).toFixed(1)} KB`;

  return {
    format,
    dimensions,
    metadataTags,
    generativeSignatures,
    byteEntropy: computeByteEntropy(buffer),
  };
}

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  author: string;
  text: string;
  wordCount: number;
  linksFound: string[];
}

async function readBoundedResponseText(response: globalThis.Response): Promise<string> {
  if (!response.body) {
    const txt = await response.text();
    if (Buffer.byteLength(txt, 'utf8') > MAX_CRAWL_BYTES) {
      throw new Error('Remote response exceeded 5 MB crawl limit.');
    }
    return txt;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_CRAWL_BYTES) {
        await reader.cancel();
        throw new Error('Remote response exceeded 5 MB crawl limit.');
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function fetchWithSafeRedirects(startUrl: string, maxRedirects = 3): Promise<{
  response: globalThis.Response;
  finalUrl: string;
}> {
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeExternalUrl(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Veritas-Open-Crawler/1.0 (+https://opensource.org/licenses/MIT)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect HTTP ${response.status} missing Location header.`);
        }
        const resolved = new URL(location, current).toString();
        await assertSafeExternalUrl(resolved);
        current = resolved;
        continue;
      }

      return { response, finalUrl: current };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
  throw new Error('Too many HTTP redirects during URL crawl.');
}

export async function crawlWebPages(
  entryUrl: string,
  maxPages = 1
): Promise<CrawledPage[]> {
  const parsedEntry = await assertSafeExternalUrl(entryUrl);

  const boundedMax = Math.max(1, Math.min(10, maxPages));
  const visited = new Set<string>();
  const queue: string[] = [parsedEntry.toString()];
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < boundedMax) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const { response, finalUrl } = await fetchWithSafeRedirects(currentUrl);

      if (!response.ok) {
        if (pages.length === 0) {
          throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${currentUrl}`);
        }
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const rawBody = await readBoundedResponseText(response);

      if (contentType.includes('text/plain')) {
        const cleaned = rawBody.trim();
        pages.push({
          url: currentUrl,
          title: parsedEntry.hostname,
          description: '',
          author: '',
          text: cleaned,
          wordCount: cleaned.split(/\s+/).filter(Boolean).length,
          linksFound: [],
        });
        continue;
      }

      const $ = cheerio.load(rawBody);
      const title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('title').text().trim() ||
        currentUrl;
      const description =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';
      const author =
        $('meta[name="author"]').attr('content')?.trim() ||
        $('[rel="author"]').first().text().trim() ||
        '';

      // Collect same-origin links before removing nav/footer
      const sameOriginLinks: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
          return;
        }
        try {
          const resolved = new URL(href, finalUrl);
          if (
            resolved.origin === parsedEntry.origin &&
            ['http:', 'https:'].includes(resolved.protocol) &&
            !resolved.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js)$/i)
          ) {
            resolved.hash = '';
            const cleanHref = resolved.toString();
            if (!visited.has(cleanHref) && !sameOriginLinks.includes(cleanHref)) {
              sameOriginLinks.push(cleanHref);
            }
          }
        } catch {
          // Skip invalid URLs
        }
      });

      $('script, style, noscript, iframe, svg, nav, footer, header, aside').remove();
      const articleRoot = $('article').length > 0 ? $('article') : $('main').length > 0 ? $('main') : $('body');
      const blocks: string[] = [];
      articleRoot.find('h1, h2, h3, p, li, blockquote').each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t.length >= 20) blocks.push(t);
      });
      const extractedText =
        blocks.length > 0
          ? blocks.join('\n\n')
          : articleRoot.text().replace(/\s+/g, ' ').trim();

      pages.push({
        url: currentUrl,
        title,
        description,
        author,
        text: extractedText,
        wordCount: extractedText.split(/\s+/).filter(Boolean).length,
        linksFound: sameOriginLinks.slice(0, 20),
      });

      for (const link of sameOriginLinks) {
        if (!visited.has(link) && queue.length < 25) {
          queue.push(link);
        }
      }
    } catch (err) {
      if (pages.length === 0) {
        throw err;
      }
    }
  }

  return pages;
}
