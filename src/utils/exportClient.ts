import type { CitationEntry, CitationStyle, DetectionRecord, HumanizedRevision } from '../types/veritas.ts';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(title: string): string {
  return title.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'veritas-report';
}

function safeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const sanitized = /^[=+\-@\t\r]/.test(cleaned.trimStart()) ? `'${cleaned}` : cleaned;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function formatCitation(c: CitationEntry, style: CitationStyle): string {
  const authors = c.authors.length > 0 ? c.authors : ['Unknown Author'];
  const firstAuthor = authors[0];
  const joinedAuthors =
    authors.length === 1
      ? firstAuthor
      : authors.length === 2
        ? `${authors[0]} & ${authors[1]}`
        : `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}`;
  const doiOrUrl = c.doi ? `https://doi.org/${c.doi.replace(/^https?:\/\/doi\.org\//i, '')}` : c.url || '';

  if (style === 'APA') {
    return `${joinedAuthors} (${c.year}). ${c.title}. ${c.publisherOrJournal}.${doiOrUrl ? ` ${doiOrUrl}` : ''}`;
  }
  if (style === 'MLA') {
    return `${authors.join(', ')}. "${c.title}." ${c.publisherOrJournal}, ${c.year}${doiOrUrl ? `, ${doiOrUrl}` : ''}.`;
  }
  if (style === 'Chicago') {
    return `${authors.join(', ')}. "${c.title}." ${c.publisherOrJournal} (${c.year}).${doiOrUrl ? ` ${doiOrUrl}.` : ''}`;
  }
  if (style === 'IEEE') {
    return `${authors.join(', ')}, "${c.title}," ${c.publisherOrJournal}, ${c.year}.${doiOrUrl ? ` [Online]. Available: ${doiOrUrl}` : ''}`;
  }
  const key = `${firstAuthor.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') || 'ref'}${c.year}`;
  return `@misc{${key},\n  author = {${authors.join(' and ')}},\n  title = {${c.title}},\n  year = {${c.year}},\n  howpublished = {${c.publisherOrJournal}}${c.doi ? `,\n  doi = {${c.doi}}` : ''}${c.url ? `,\n  url = {${c.url}}` : ''}\n}`;
}

export function exportCitationsBibtex(citations: CitationEntry[]) {
  const body = citations.map((c) => formatCitation(c, 'BibTeX')).join('\n\n');
  const blob = new Blob([body], { type: 'application/x-bibtex;charset=utf-8' });
  triggerDownload(blob, 'veritas-references.bib');
}

export function exportRecordJson(record: DetectionRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerDownload(blob, `${safeSlug(record.title)}.json`);
}

export function exportRecordTxt(record: DetectionRecord, humanizedOnly = false) {
  const latestHuman = record.humanizedVersions?.[0];
  const body =
    humanizedOnly && latestHuman
      ? latestHuman.humanizedText
      : [
          `VERITAS CONTENT INTELLIGENCE REPORT`,
          `Title: ${record.title}`,
          `Date: ${new Date(record.createdAt).toLocaleString()}`,
          `Authenticity Index: ${record.authenticity?.overallScore ?? '—'}/100 (${record.authenticity?.grade ?? '—'})`,
          `Authorship Verdict: ${record.verdict} (${record.aiProbability}% AI / ${record.humanProbability}% Human)`,
          `Content Quality: ${record.contentQuality?.overallScore ?? record.writingQuality.overall}/100`,
          `SEO Score: ${record.seoAnalysis?.overallScore ?? '—'}/100`,
          `Academic Integrity: ${record.academicIntegrity?.integrityScore ?? '—'}/100 (${record.academicIntegrity?.riskLevel ?? '—'})`,
          `Confidence: ${record.confidence}% · Language: ${record.detectedLanguage} · Words: ${record.wordCount}`,
          ``,
          `SUMMARY`,
          record.summary,
          ``,
          ...(record.factCheck
            ? [
                `FACT-CHECK & SOURCE VERIFICATION (Veracity: ${record.factCheck.overallVeracityScore}%)`,
                ...record.factCheck.claims.map(
                  (c) => `- [${c.status}] ${c.claim} (${c.explanation})`
                ),
                ``,
              ]
            : []),
          `READABILITY & QUALITY`,
          `Flesch Reading Ease: ${record.readability.fleschReadingEase} | Flesch-Kincaid Grade: ${record.readability.fleschKincaidGrade} | Coleman-Liau: ${record.readability.colemanLiauIndex}`,
          `Gunning Fog: ${record.readability.gunningFog} | Burstiness: ${record.writingQuality.burstiness}%`,
          ``,
          `CONTENT`,
          record.fullText,
          ...(latestHuman
            ? [
                ``,
                `HUMANIZED REVISION (${latestHuman.intensity.toUpperCase()} · ${latestHuman.originalAiScore}% -> ${latestHuman.recheckAiScore}% AI)`,
                latestHuman.humanizedText,
              ]
            : []),
        ].join('\n');

  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  triggerDownload(
    blob,
    `${safeSlug(record.title)}${humanizedOnly ? '_humanized' : ''}.txt`
  );
}

export function exportRecordCsv(records: DetectionRecord[]) {
  const header = [
    'id',
    'createdAt',
    'sourceType',
    'title',
    'authenticityScore',
    'verdict',
    'aiProbability',
    'contentQualityScore',
    'seoScore',
    'academicIntegrityScore',
    'detectedLanguage',
    'wordCount',
    'fleschKincaidGrade',
    'burstiness',
    'plagiarismSimilarityPercent',
  ].join(',');

  const rows = records.map((r) =>
    [
      safeCsvCell(r.id),
      safeCsvCell(r.createdAt),
      safeCsvCell(r.sourceType),
      safeCsvCell(r.title),
      safeCsvCell(r.authenticity?.overallScore ?? ''),
      safeCsvCell(r.verdict),
      safeCsvCell(r.aiProbability),
      safeCsvCell(r.contentQuality?.overallScore ?? r.writingQuality.overall),
      safeCsvCell(r.seoAnalysis?.overallScore ?? ''),
      safeCsvCell(r.academicIntegrity?.integrityScore ?? ''),
      safeCsvCell(r.detectedLanguage),
      safeCsvCell(r.wordCount),
      safeCsvCell(r.readability.fleschKincaidGrade),
      safeCsvCell(r.writingQuality.burstiness),
      safeCsvCell(r.plagiarism.overallSimilarityPercent),
    ].join(',')
  );

  const blob = new Blob([[header, ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  triggerDownload(
    blob,
    records.length === 1 ? `${safeSlug(records[0].title)}.csv` : 'veritas-intelligence-export.csv'
  );
}

export async function exportRecordPdf(record: DetectionRecord) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const maxWidth = 516;
  let y = 52;

  const addWrappedText = (text: string, fontSize: number, bold = false, gap = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      if (y > 730) {
        doc.addPage();
        y = 52;
      }
      doc.text(line, margin, y);
      y += fontSize * 1.35;
    }
    y += gap;
  };

  addWrappedText('Veritas Content Intelligence & Integrity Report', 18, true, 4);
  addWrappedText(record.title, 12, true, 8);
  addWrappedText(
    `Authenticity: ${record.authenticity?.overallScore ?? '—'}/100 (${record.authenticity?.grade ?? '—'})  |  Authorship: ${record.verdict} (${record.aiProbability}% AI)  |  Confidence: ${record.confidence}%`,
    10,
    false,
    4
  );
  addWrappedText(
    `Quality: ${record.contentQuality?.overallScore ?? record.writingQuality.overall}/100  |  SEO: ${record.seoAnalysis?.overallScore ?? '—'}/100  |  Academic Integrity: ${record.academicIntegrity?.integrityScore ?? '—'}/100 (${record.academicIntegrity?.riskLevel ?? '—'})`,
    10,
    false,
    12
  );

  addWrappedText('Forensic Summary', 12, true, 4);
  addWrappedText(record.summary, 10, false, 12);

  addWrappedText('Readability & Linguistic Metrics', 12, true, 4);
  addWrappedText(
    `Flesch Reading Ease: ${record.readability.fleschReadingEase}   |   Flesch-Kincaid Grade: ${record.readability.fleschKincaidGrade}   |   Coleman-Liau: ${record.readability.colemanLiauIndex}   |   Gunning Fog: ${record.readability.gunningFog}\nBurstiness: ${record.writingQuality.burstiness}%   |   Type-Token Ratio: ${record.writingQuality.typeTokenRatio}   |   Target Audience: ${record.readability.targetAudience}`,
    10,
    false,
    12
  );

  if (record.factCheck) {
    addWrappedText(
      `Fact-Check & Source Verification (Veracity: ${record.factCheck.overallVeracityScore}%)`,
      12,
      true,
      4
    );
    for (const c of record.factCheck.claims) {
      addWrappedText(`[${c.status}] ${c.claim} — ${c.explanation}`, 9.5, false, 4);
    }
    y += 6;
  }

  addWrappedText('Analyzed Content', 12, true, 4);
  addWrappedText(record.fullText.slice(0, 12000), 10, false, 12);

  if (record.humanizedVersions && record.humanizedVersions.length > 0) {
    const h = record.humanizedVersions[0];
    addWrappedText(
      `Humanized Revision (${h.intensity.toUpperCase()} · ${h.originalAiScore}% -> ${h.recheckAiScore}% AI)`,
      12,
      true,
      4
    );
    addWrappedText(h.humanizedText.slice(0, 12000), 10, false, 8);
  }

  doc.save(`${safeSlug(record.title)}.pdf`);
}

export async function exportRecordDocx(record: DetectionRecord, humanizedOnly = false) {
  const res = await fetch('/api/v1/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record, humanizedOnly }),
  });
  if (!res.ok) {
    throw new Error('Failed to generate DOCX file.');
  }
  const blob = await res.blob();
  triggerDownload(
    blob,
    `${safeSlug(record.title)}${humanizedOnly ? '_humanized' : ''}.docx`
  );
}

export async function exportBulkZip(recordIds: string[]) {
  const res = await fetch('/api/v1/export/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordIds }),
  });
  if (!res.ok) {
    throw new Error('Failed to create bulk ZIP archive.');
  }
  const blob = await res.blob();
  triggerDownload(blob, 'veritas-bulk-export.zip');
}

export function exportHumanizedTxt(rev: HumanizedRevision) {
  const blob = new Blob([rev.humanizedText], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `humanized-${rev.intensity}-${rev.id}.txt`);
}

export async function exportHumanizedPdf(rev: HumanizedRevision) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const maxWidth = 516;
  let y = 52;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Veritas Humanized Output (${rev.intensity.toUpperCase()})`, margin, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Original AI Score: ${rev.originalAiScore}%  ->  Re-checked AI Score: ${rev.recheckAiScore}% (${rev.recheckVerdict})`,
    margin,
    y
  );
  y += 24;
  const lines = doc.splitTextToSize(rev.humanizedText, maxWidth) as string[];
  for (const line of lines) {
    if (y > 730) {
      doc.addPage();
      y = 52;
    }
    doc.text(line, margin, y);
    y += 14;
  }
  doc.save(`humanized-${rev.intensity}-${rev.id}.pdf`);
}
