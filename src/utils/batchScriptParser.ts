import { createId } from '../db/database';
import type { DocumentType, ScriptBlock } from '../types/models';
import { splitTextIntoBlocks } from './textSplitter';

export interface ParsedBatchPiece {
  id: string;
  referenceLabel: string;
  pieceTitle: string;
  referenceUrl?: string;
  docTitle: string;
  docType: DocumentType;
  blocks: ScriptBlock[];
  selected: boolean;
}

export interface BatchParseResult {
  mode: 'batch-pieces' | 'single-table' | 'plain-text';
  suggestedProjectName?: string;
  pieces: ParsedBatchPiece[];
}

const REFERENCE_LINE_RE = /^REFERENCIA\s+\d+[^\n]*/i;
const TABLE_HEADER_RE = /^(tiempo|escena|bloque|parte)\t+(plano|acci[oó]n|indicaci)/i;
const URL_RE = /https?:\/\/\S+/i;
const TIMESTAMP_PREFIX_RE = /^\[?(\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?)\]?(?:\s*[:\-–·]\s*|\s+|$)/;
const CUE_LABEL_RE = /^(plano|c[aá]mara|acci[oó]n|indicaci[oó]n|indicaciones|texto\s+en\s+pantalla|en\s+pantalla|nota)\s*:\s*(.+)$/i;
const BRACKET_CUE_RE = /\[([^\]]+)\]/g;
const PAREN_CUE_RE = /\(((?:plano|c[aá]mara|camara|pausa|acci[oó]n|accion|indicaci[oó]n|indicacion|en\s+pantalla|voz|m[uú]sica|musica|sonido|sfx|b-roll)[^)]*)\)/gi;

function extractTablessBlockMetadata(rawLines: string[]): {
  title?: string;
  cues?: string;
  referenceUrl?: string;
  text: string;
} {
  let title: string | undefined;
  let referenceUrl: string | undefined;
  const cueParts: string[] = [];
  const textLines: string[] = [];

  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Extract URL if present
    const urlMatch = line.match(URL_RE);
    if (urlMatch) {
      if (!referenceUrl) referenceUrl = urlMatch[0];
      line = line.replace(URL_RE, '').trim();
      if (!line) continue;
    }

    // Extract leading timestamp (e.g. 00:00 - 00:05)
    const tsMatch = line.match(TIMESTAMP_PREFIX_RE);
    if (tsMatch) {
      const ts = tsMatch[1].replace(/\s+/g, ' ').trim();
      if (!title) title = ts;
      else cueParts.push(ts);
      line = line.slice(tsMatch[0].length).trim();
      if (!line) continue;
    }

    // Extract explicit cue labels (Plano: ..., Cámara: ..., etc.)
    const cueLabelMatch = line.match(CUE_LABEL_RE);
    if (cueLabelMatch) {
      cueParts.push(`${cueLabelMatch[1].trim()}: ${cueLabelMatch[2].trim()}`);
      continue;
    }

    // Extract [bracketed] and known (parenthesized) cues inline
    line = line
      .replace(BRACKET_CUE_RE, (_m, inner: string) => {
        const cleaned = inner.trim();
        if (cleaned) cueParts.push(cleaned);
        return '';
      })
      .replace(PAREN_CUE_RE, (_m, inner: string) => {
        const cleaned = inner.trim();
        if (cleaned) cueParts.push(cleaned);
        return '';
      })
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (line) {
      textLines.push(cleanGuillemets(line));
    }
  }

  return {
    title,
    cues: cueParts.length > 0 ? cueParts.join(' · ') : undefined,
    referenceUrl,
    text: textLines.join('\n').trim()
  };
}

function parseTablessLinesToBlocks(rawLines: string[]): {
  blocks: ScriptBlock[];
  referenceUrl?: string;
} {
  const joined = rawLines.join('\n').trim();
  if (!joined) return { blocks: [] };

  let detectedUrl: string | undefined;

  // If lines start with timestamps, group into blocks by timestamp
  const hasTimestampRows = rawLines.some((l) => TIMESTAMP_PREFIX_RE.test(l.trim()));
  if (hasTimestampRows) {
    const groups: string[][] = [];
    for (const raw of rawLines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (TIMESTAMP_PREFIX_RE.test(trimmed) || groups.length === 0) {
        groups.push([trimmed]);
      } else {
        groups[groups.length - 1].push(trimmed);
      }
    }

    const blocks: ScriptBlock[] = [];
    for (const grp of groups) {
      const meta = extractTablessBlockMetadata(grp);
      if (meta.referenceUrl && !detectedUrl) detectedUrl = meta.referenceUrl;
      if (meta.text || meta.cues) {
        blocks.push({
          id: createId('blk'),
          title: meta.title || `Bloque ${blocks.length + 1}`,
          text: meta.text,
          cues: meta.cues
        });
      }
    }
    if (blocks.length > 0) {
      return { blocks, referenceUrl: detectedUrl };
    }
  }

  // Otherwise split via textSplitter and enrich each block with cues/URL extraction
  const split = splitTextIntoBlocks(joined);
  const blocks: ScriptBlock[] = [];
  for (const blk of split.blocks) {
    const meta = extractTablessBlockMetadata(blk.text.split('\n'));
    if (meta.referenceUrl && !detectedUrl) detectedUrl = meta.referenceUrl;
    if (meta.text || meta.cues || blk.title) {
      blocks.push({
        id: blk.id,
        title: blk.title || meta.title || `Bloque ${blocks.length + 1}`,
        text: meta.text,
        cues: meta.cues || blk.cues
      });
    }
  }

  return { blocks, referenceUrl: detectedUrl };
}

function cleanGuillemets(raw: string): string {
  const trimmed = raw.trim();
  const wrappedWithPeriod = trimmed.match(/^«([\s\S]+)»(\.?)$/);
  if (wrappedWithPeriod) {
    const inner = wrappedWithPeriod[1].trim();
    const trailingDot = wrappedWithPeriod[2];
    if (trailingDot && !/[.!?…]$/.test(inner)) {
      return `${inner}${trailingDot}`;
    }
    return inner;
  }
  return trimmed;
}

function parseTabRow(cols: string[]): ScriptBlock | null {
  if (cols.length < 2) return null;
  const title = (cols[0] || '').trim();
  if (!title) return null;

  if (cols.length >= 3) {
    const cues = (cols[1] || '').trim();
    const rawText = cols.slice(2).join(' ').trim();
    const text = cleanGuillemets(rawText || cues);
    return {
      id: createId('blk'),
      title,
      text,
      cues: rawText && cues ? cues : undefined
    };
  }

  return {
    id: createId('blk'),
    title,
    text: cleanGuillemets(cols[1] || '')
  };
}

function extractRefTitleFallback(refLine: string): string {
  return refLine
    .replace(/^REFERENCIA\s+\d+\s*[★*]?\s*[·:\-–]?\s*/i, '')
    .trim();
}

function parseSingleReferenceSection(
  sectionLines: string[]
): { piece: ParsedBatchPiece; suggestedProject?: string } | null {
  const nonEmpty = sectionLines.map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (nonEmpty.length === 0) return null;

  const refLine = nonEmpty[0].trim();
  let pieceTitle = extractRefTitleFallback(refLine) || 'Pieza importada';
  let referenceUrl: string | undefined;
  let docTitle = 'Guion final';
  let suggestedProject: string | undefined;

  let tableStartIdx = 1;

  // Check if line 1 is metadata like: "Guion NOXA\tTítulo\thttps://..."
  if (nonEmpty.length > 1 && !TABLE_HEADER_RE.test(nonEmpty[1].trim())) {
    const metaCols = nonEmpty[1].split('\t').map((c) => c.trim()).filter(Boolean);
    const hasUrl = metaCols.some((c) => URL_RE.test(c));
    const looksLikeProjectMeta =
      metaCols.length >= 2 &&
      (/^(guion|libreto|estructura)/i.test(metaCols[0]) || hasUrl);

    if (looksLikeProjectMeta) {
      const projMatch = metaCols[0].match(/^(?:guion|libreto|estructura)\s+(.+)$/i);
      if (projMatch) {
        suggestedProject = projMatch[1].trim();
        docTitle = metaCols[0].trim();
      }
      const urlCol = metaCols.find((c) => URL_RE.test(c));
      if (urlCol) {
        const m = urlCol.match(URL_RE);
        if (m) referenceUrl = m[0];
      }
      const titleCandidates = metaCols.filter(
        (c, idx) => idx > 0 && !URL_RE.test(c)
      );
      if (titleCandidates.length > 0) {
        pieceTitle = titleCandidates[0];
      }
      tableStartIdx = 2;
    }
  }

  const blocks: ScriptBlock[] = [];
  for (let i = tableStartIdx; i < nonEmpty.length; i++) {
    const line = nonEmpty[i].trim();
    if (!line || TABLE_HEADER_RE.test(line)) continue;

    if (line.includes('\t')) {
      const cols = nonEmpty[i].split('\t').map((c) => c.trim());
      const blk = parseTabRow(cols);
      if (blk) blocks.push(blk);
    } else if (blocks.length > 0) {
      // Continuation line of previous block's text
      blocks[blocks.length - 1].text = `${blocks[blocks.length - 1].text}\n${line}`.trim();
    }
  }

  // Fallback for tabless REFERENCIA sections (e.g., pasted from WhatsApp or Notas)
  if (blocks.length === 0) {
    const remaining = nonEmpty.slice(tableStartIdx);
    const bodyLines: string[] = [];
    for (const raw of remaining) {
      const trimmed = raw.trim();
      const projMatch = trimmed.match(/^(?:guion|libreto|estructura)\s+(.+)$/i);
      if (!suggestedProject && projMatch && bodyLines.length === 0) {
        suggestedProject = projMatch[1].trim();
        docTitle = trimmed;
        continue;
      }
      if (!referenceUrl && URL_RE.test(trimmed) && trimmed.replace(URL_RE, '').trim() === '') {
        const m = trimmed.match(URL_RE);
        if (m) referenceUrl = m[0];
        continue;
      }
      bodyLines.push(raw);
    }

    const tabless = parseTablessLinesToBlocks(bodyLines);
    if (!referenceUrl && tabless.referenceUrl) {
      referenceUrl = tabless.referenceUrl;
    }
    blocks.push(...tabless.blocks);
  }

  if (blocks.length === 0) return null;

  return {
    suggestedProject,
    piece: {
      id: createId('piece-draft'),
      referenceLabel: refLine,
      pieceTitle,
      referenceUrl,
      docTitle,
      docType: 'Guion',
      blocks,
      selected: true
    }
  };
}

export function parsePastedScriptBatch(rawText: string): BatchParseResult {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { mode: 'plain-text', pieces: [] };
  }

  const lines = normalized.split('\n');
  const refIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (REFERENCE_LINE_RE.test(line.trim())) {
      refIndices.push(idx);
    }
  });

  // Case 1: One or more REFERENCIA sections
  if (refIndices.length >= 1) {
    const pieces: ParsedBatchPiece[] = [];
    let suggestedProjectName: string | undefined;

    for (let i = 0; i < refIndices.length; i++) {
      const start = refIndices[i];
      const end = i + 1 < refIndices.length ? refIndices[i + 1] : lines.length;
      const parsed = parseSingleReferenceSection(lines.slice(start, end));
      if (parsed) {
        pieces.push(parsed.piece);
        if (!suggestedProjectName && parsed.suggestedProject) {
          suggestedProjectName = parsed.suggestedProject;
        }
      }
    }

    if (pieces.length > 0) {
      return {
        mode: 'batch-pieces',
        suggestedProjectName,
        pieces
      };
    }
  }

  // Case 2: Single tab-separated table without REFERENCIA header
  const tabRows = lines
    .map((l) => l.trim())
    .filter((l) => l.includes('\t') && !TABLE_HEADER_RE.test(l));

  if (tabRows.length >= 2) {
    const blocks: ScriptBlock[] = [];
    for (const row of tabRows) {
      const cols = row.split('\t').map((c) => c.trim());
      const blk = parseTabRow(cols);
      if (blk) blocks.push(blk);
    }
    if (blocks.length >= 2) {
      return {
        mode: 'single-table',
        pieces: [
          {
            id: createId('piece-draft'),
            referenceLabel: 'Tabla pegada',
            pieceTitle: 'Nueva pieza',
            docTitle: 'Guion pegado',
            docType: 'Guion',
            blocks,
            selected: true
          }
        ]
      };
    }
  }

  // Case 3: Plain text fallback (with timestamp/cue/URL extraction for WhatsApp/Notas)
  const tabless = parseTablessLinesToBlocks(lines);
  return {
    mode: 'plain-text',
    pieces: [
      {
        id: createId('piece-draft'),
        referenceLabel: 'Texto pegado',
        pieceTitle: 'Nueva pieza',
        referenceUrl: tabless.referenceUrl,
        docTitle: 'Guion pegado',
        docType: 'Guion',
        blocks: tabless.blocks,
        selected: true
      }
    ]
  };
}
