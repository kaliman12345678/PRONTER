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

  // Case 3: Plain text fallback
  const split = splitTextIntoBlocks(normalized);
  return {
    mode: 'plain-text',
    pieces: [
      {
        id: createId('piece-draft'),
        referenceLabel: 'Texto pegado',
        pieceTitle: 'Nueva pieza',
        docTitle: 'Guion pegado',
        docType: 'Guion',
        blocks: split.blocks,
        selected: true
      }
    ]
  };
}
