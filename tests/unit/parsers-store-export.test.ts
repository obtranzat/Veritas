import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crawlWebPages,
  extractDocumentText,
  inspectImageBinaryMetadata,
  validateBinarySignature,
} from '../../src/server/parsers.ts';
import { store } from '../../src/server/store.ts';
import {
  exportBulkZip,
  exportCitationsBibtex,
  exportHumanizedPdf,
  exportHumanizedTxt,
  exportRecordCsv,
  exportRecordDocx,
  exportRecordJson,
  exportRecordPdf,
  exportRecordTxt,
  formatCitation,
} from '../../src/utils/exportClient.ts';

vi.mock('unpdf', () => ({
  extractText: vi.fn(async () => ({
    text: ['Extracted PDF page one text.', 'Extracted PDF page two text.'],
    totalPages: 2,
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: 'Extracted DOCX body text.' })),
  },
}));

vi.mock('jspdf', () => {
  return {
    jsPDF: class MockJsPDF {
      setFont() {}
      setFontSize() {}
      splitTextToSize(text: string) {
        return text.split('\n');
      }
      addPage() {}
      text() {}
      save() {}
    },
  };
});

describe('Parsers, Binary Forensics, Store & ExportClient Unit Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('extracts PDF, DOCX, HTML, RTF, TXT, and valid ODT while blocking spoofed executables', async () => {
    const pdf = await extractDocumentText(Buffer.from('%PDF-1.7 mock content'), 'paper.pdf', 'application/pdf');
    expect(pdf.format).toBe('PDF');
    expect(pdf.pageCount).toBe(2);
    expect(pdf.text).toContain('Extracted PDF page one text.');

    const docx = await extractDocumentText(Buffer.from('PK\x03\x04mockdocx'), 'draft.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(docx.format).toBe('DOCX');
    expect(docx.text).toBe('Extracted DOCX body text.');

    const html = await extractDocumentText(
      Buffer.from('<html><body><script>evil()</script><p>Hello World</p></body></html>'),
      'page.html',
      'text/html'
    );
    expect(html.format).toBe('HTML');
    expect(html.text).toBe('Hello World');

    const rtf = await extractDocumentText(
      Buffer.from('{\\rtf1\\ansi{\\fonttbl Arial;}\\par First line\\par Second line}'),
      'doc.rtf',
      'application/rtf'
    );
    expect(rtf.format).toBe('RTF');
    expect(rtf.text).toContain('First line');

    const odtZip = new JSZip();
    odtZip.file(
      'content.xml',
      '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>OpenDocument paragraph</text:p></office:text></office:body></office:document-content>'
    );
    const odtBuf = await odtZip.generateAsync({ type: 'nodebuffer' });
    const odt = await extractDocumentText(odtBuf, 'note.odt', 'application/vnd.oasis.opendocument.text');
    expect(odt.format).toBe('ODT');
    expect(odt.text).toContain('OpenDocument paragraph');

    const odtBadZip = new JSZip();
    odtBadZip.file('other.txt', 'missing content xml');
    await expect(
      extractDocumentText(await odtBadZip.generateAsync({ type: 'nodebuffer' }), 'bad.odt', 'application/vnd.oasis.opendocument.text')
    ).rejects.toThrow(/missing content\.xml/);

    const txt = await extractDocumentText(Buffer.from('Plain text sample.'), 'plain.txt', 'text/plain');
    expect(txt.format).toBe('TXT');

    // Disguised ELF and PE executables must throw
    expect(() =>
      validateBinarySignature(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]), 'invoice.pdf', 'application/pdf')
    ).toThrow(/Rejected executable/);
    expect(() =>
      validateBinarySignature(Buffer.from('MZ\x90\x00'), 'avatar.png', 'image/png')
    ).toThrow(/Rejected executable/);
    expect(() =>
      validateBinarySignature(Buffer.from('NOT-A-PDF'), 'doc.pdf', 'application/pdf')
    ).toThrow(/Invalid PDF/);
    expect(() =>
      validateBinarySignature(Buffer.from('BAD'), 'doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toThrow(/Invalid ZIP/);
    expect(() =>
      validateBinarySignature(Buffer.from('BAD'), 'pic.png', 'image/png')
    ).toThrow(/Invalid PNG/);
    expect(() =>
      validateBinarySignature(Buffer.from('BAD'), 'pic.jpg', 'image/jpeg')
    ).toThrow(/Invalid JPEG/);
    expect(() =>
      validateBinarySignature(Buffer.from('BAD'), 'pic.webp', 'image/webp')
    ).toThrow(/Invalid WEBP/);
  });

  it('parses PNG iTXt/tEXt/caBX chunks, JPEG EXIF/XMP/SOF0, WEBP, and TIFF headers', () => {
    // Construct minimal valid PNG with IHDR + iTXt + caBX + IEND
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(512, 0);
    ihdrData.writeUInt32BE(512, 4);
    const ihdrLen = Buffer.alloc(4);
    ihdrLen.writeUInt32BE(13, 0);
    const ihdr = Buffer.concat([ihdrLen, Buffer.from('IHDR'), ihdrData, Buffer.alloc(4)]);

    const textPayload = Buffer.from('parameters\0prompt: Stable Diffusion XL cinematic');
    const textLen = Buffer.alloc(4);
    textLen.writeUInt32BE(textPayload.length, 0);
    const textChunk = Buffer.concat([textLen, Buffer.from('iTXt'), textPayload, Buffer.alloc(4)]);

    const cabxLen = Buffer.alloc(4);
    cabxLen.writeUInt32BE(4, 0);
    const cabxChunk = Buffer.concat([cabxLen, Buffer.from('caBX'), Buffer.from('c2pa'), Buffer.alloc(4)]);

    const iend = Buffer.concat([Buffer.alloc(4), Buffer.from('IEND'), Buffer.alloc(4)]);
    const pngBuf = Buffer.concat([pngHeader, ihdr, textChunk, cabxChunk, iend]);

    const pngMeta = inspectImageBinaryMetadata(pngBuf, 'image/png', 'gen.png');
    expect(pngMeta.format).toBe('PNG');
    expect(pngMeta.dimensions).toEqual({ width: 512, height: 512 });
    expect(pngMeta.generativeSignatures.length).toBeGreaterThanOrEqual(2);

    // JPEG with SOF0 + APP1 Exif + APP1 XMP + COM marker
    const sofData = Buffer.alloc(7);
    sofData.writeUInt16BE(240, 1);
    sofData.writeUInt16BE(320, 3);
    const sofLen = Buffer.alloc(2);
    sofLen.writeUInt16BE(2 + sofData.length, 0);

    const exif = Buffer.from('Exif\0\0Canon EOS');
    const exifLen = Buffer.alloc(2);
    exifLen.writeUInt16BE(2 + exif.length, 0);

    const xmp = Buffer.from('http://ns.adobe.com/xap/1.0/ Adobe Firefly');
    const xmpLen = Buffer.alloc(2);
    xmpLen.writeUInt16BE(2 + xmp.length, 0);

    const comment = Buffer.from('Generated with Midjourney v6');
    const comLen = Buffer.alloc(2);
    comLen.writeUInt16BE(2 + comment.length, 0);
    const jpgBuf = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xc0]), sofLen, sofData,
      Buffer.from([0xff, 0xe1]), exifLen, exif,
      Buffer.from([0xff, 0xe1]), xmpLen, xmp,
      Buffer.from([0xff, 0xfe]), comLen, comment,
      Buffer.from([0xff, 0xd9]),
    ]);
    const jpgMeta = inspectImageBinaryMetadata(jpgBuf, 'image/jpeg', 'pic.jpg');
    expect(jpgMeta.format).toBe('JPEG');
    expect(jpgMeta.dimensions).toEqual({ width: 320, height: 240 });
    expect(jpgMeta.metadataTags['EXIF Header']).toContain('Canon');
    expect(jpgMeta.metadataTags['XMP Packet']).toContain('adobe');

    // WEBP
    const webpBuf = Buffer.concat([Buffer.from('RIFF\x20\x00\x00\x00WEBPEXIFXMP'), Buffer.from('ComfyUI')]);
    const webpMeta = inspectImageBinaryMetadata(webpBuf, 'image/webp', 'w.webp');
    expect(webpMeta.format).toBe('WEBP');
    expect(webpMeta.generativeSignatures.length).toBe(1);

    // TIFF
    const tiffMeta = inspectImageBinaryMetadata(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]), 'image/tiff', 't.tiff');
    expect(tiffMeta.format).toBe('TIFF');
  });

  it('crawls multi-page HTML & text/plain pages, handles oversized responses, HTTP errors, and blocks redirect SSRF', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('redirect-evil')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1:3000/api/v1/keys' },
        });
      }
      if (target.includes('redirect-missing')) {
        return new Response(null, { status: 302 });
      }
      if (target.includes('redirect-loop')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://93.184.216.34/redirect-loop' },
        });
      }
      if (target.includes('not-found')) {
        return new Response('Missing', { status: 404, statusText: 'Not Found' });
      }
      if (target.includes('too-big')) {
        const bigStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(6 * 1024 * 1024));
            controller.close();
          },
        });
        return new Response(bigStream, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (target.includes('plain.txt')) {
        return new Response('Plain crawled text line one.\nPlain crawled text line two.', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (target.includes('/next')) {
        return new Response(
          '<html><head><title>Linked Followup Page</title></head><body><article><p>Secondary page text extracted cleanly across crawl queue.</p></article></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }
      return new Response(
        `<html><head><title>Public Article</title></head><body><main><p>This is a detailed investigative journalism article about transparent science.</p><a href="/next">Next page with link</a><a href="#top">Skip</a></main></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    }) as typeof fetch;

    const pages = await crawlWebPages('https://93.184.216.34/article', 2);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Public Article');
    expect(pages[1].title).toBe('Linked Followup Page');

    const plainPages = await crawlWebPages('https://93.184.216.34/plain.txt', 1);
    expect(plainPages[0].text).toContain('Plain crawled text');

    await expect(crawlWebPages('https://93.184.216.34/redirect-evil', 1)).rejects.toThrow(/SSRF/);
    await expect(crawlWebPages('https://93.184.216.34/redirect-missing', 1)).rejects.toThrow(/Location header/);
    await expect(crawlWebPages('https://93.184.216.34/redirect-loop', 1)).rejects.toThrow(/Too many HTTP redirects/);
    await expect(crawlWebPages('https://93.184.216.34/not-found', 1)).rejects.toThrow(/HTTP 404/);
    await expect(crawlWebPages('https://93.184.216.34/too-big', 1)).rejects.toThrow(/5 MB crawl limit/);
  });

  it('manages store records, API keys, rate limiting, and full GDPR erasure of user + comments + stylometric profile', () => {
    const publicKeys = store.getPublicApiKeys();
    expect(publicKeys.length).toBeGreaterThanOrEqual(1);
    expect((publicKeys[0] as Record<string, unknown>).keyHash).toBeUndefined();

    const { record, rawKey } = store.createApiKey('Test Runner Token', 2, 'Reviewer');
    expect(store.verifyAndTrackApiKey(rawKey).allowed).toBe(true);
    expect(store.verifyAndTrackApiKey(rawKey).allowed).toBe(true);
    expect(store.verifyAndTrackApiKey(rawKey).status).toBe(429);
    expect(store.verifyAndTrackApiKey('vrt_invalid').status).toBe(401);
    store.updateApiKey(record.id, { active: false });
    expect(store.verifyAndTrackApiKey(rawKey).status).toBe(403);
    expect(store.deleteApiKey(record.id)).toBe(true);

    const user = store.createUser({ name: 'Test GDPR Subject', email: 'gdpr@test.local', role: 'Reviewer' });
    // Attach comment + stylometric profile to exercise complete GDPR anonymization & deletion
    const recId = store.getHistory()[0].id;
    store.addComment(recId, {
      id: 'cmt-gdpr-1',
      userId: user.id,
      userName: user.name,
      userRole: 'Reviewer',
      text: 'Subject comment',
      createdAt: new Date().toISOString(),
    });
    store.upsertAuthorProfile({
      id: 'prof-gdpr-1',
      authorName: user.name,
      departmentOrRole: 'External',
      sampleCount: 1,
      totalWordsProfiled: 120,
      updatedAt: new Date().toISOString(),
      vector: {
        avgSentenceLength: 14,
        burstiness: 48,
        typeTokenRatio: 0.55,
        hapaxRatio: 0.45,
        avgWordLength: 4.8,
        punctuationPer100Words: 12,
        contractionRate: 0.05,
        functionWordRatios: [0.04, 0.03, 0.02],
      },
    });
    const erasure = store.eraseUserAndPii(user.id);
    expect(erasure.deleted).toBe(true);
    expect(erasure.scrubbedRecords).toBeGreaterThanOrEqual(1);
    expect(erasure.deletedProfiles).toBe(1);
    expect(store.eraseUserAndPii('usr-nonexistent').deleted).toBe(false);
  });

  it('formats citations and generates exports without CSV formula injection', async () => {
    const cit = store.getCitations()[0];
    expect(formatCitation(cit, 'APA')).toContain('(2019)');
    expect(formatCitation(cit, 'MLA')).toContain(cit.title);
    expect(formatCitation(cit, 'Chicago')).toContain(cit.year);
    expect(formatCitation(cit, 'IEEE')).toContain('[Online]');
    expect(formatCitation(cit, 'BibTeX')).toContain('@misc{');

    const blobsCaptured: string[] = [];
    const blobPromises: Promise<void>[] = [];
    // Spy via minimal browser DOM shims
    (globalThis as Record<string, unknown>).document = {
      body: { appendChild: vi.fn() },
      createElement: () => ({ href: '', download: '', click: vi.fn(), remove: vi.fn() }),
    };
    (globalThis as Record<string, unknown>).URL = {
      createObjectURL: (b: Blob) => {
        blobPromises.push(b.text().then((t) => { blobsCaptured.push(t); }));
        return 'blob:test';
      },
      revokeObjectURL: vi.fn(),
    };

    const rec = {
      ...store.getHistory()[0],
      title: '=HYPERLINK("http://evil.com","Click")',
      factCheck: {
        checkedAt: new Date().toISOString(),
        overallVeracityScore: 90,
        verifiedCount: 1,
        disputedCount: 0,
        unverifiedCount: 0,
        summary: 'Verified',
        claims: [{ id: 'c1', claim: 'Claim A', status: 'Verified' as const, confidence: 95, explanation: 'Proven', sources: [] }],
        groundingSources: [],
      },
      humanizedVersions: [{
        id: 'h1',
        createdAt: new Date().toISOString(),
        intensity: 'moderate' as const,
        originalText: 'a',
        humanizedText: 'Line one\nLine two',
        originalAiScore: 80,
        recheckAiScore: 20,
        recheckVerdict: 'Human' as const,
        preservedFactsNotes: [],
        changesSummary: 'done',
      }],
    };
    const minimalRec = {
      ...store.getHistory()[0],
      authenticity: undefined,
      contentQuality: undefined,
      seoAnalysis: undefined,
      academicIntegrity: undefined,
      factCheck: undefined,
      humanizedVersions: [],
      fullText: Array.from({ length: 65 }, (_, i) => `Paragraph line ${i + 1} for pagination.`).join('\n'),
    };

    exportCitationsBibtex([cit]);
    exportRecordJson(rec);
    exportRecordTxt(rec);
    exportRecordTxt(minimalRec, true);
    exportRecordCsv([rec, minimalRec]);
    exportHumanizedTxt(rec.humanizedVersions[0]);
    await exportRecordPdf(minimalRec);
    await exportRecordPdf(rec);
    await exportHumanizedPdf({
      ...rec.humanizedVersions[0],
      humanizedText: Array.from({ length: 65 }, (_, i) => `Humanized line ${i + 1}`).join('\n'),
    });

    globalThis.fetch = vi.fn(async () => new Response('zipbytes', { status: 200 })) as unknown as typeof fetch;
    await exportRecordDocx(rec);
    await exportRecordDocx(rec, true);
    await exportBulkZip([rec.id]);

    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 })) as unknown as typeof fetch;
    await expect(exportRecordDocx(rec)).rejects.toThrow(/DOCX/);
    await expect(exportBulkZip([rec.id])).rejects.toThrow(/ZIP/);

    await Promise.all(blobPromises);
    const csvDump = blobsCaptured.find((t) => t.startsWith('id,createdAt,sourceType'));
    expect(csvDump).toBeDefined();
    expect(csvDump).toContain(`"'=HYPERLINK`);
  });
});
