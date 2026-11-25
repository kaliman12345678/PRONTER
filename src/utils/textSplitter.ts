import { createId } from '../db/database';
import type { ScriptBlock } from '../types/models';

const HEADING_PREFIX_REGEX = /^(?:#{1,4}\s+|\[([^\]]+)\]|((?:gancho|escena|bloque|parte|intro|introducción|desarrollo|diálogo|dialogo|cierre|cta|outro|punto|paso)\s*\d*)\s*[:\-–])$/i;
const INLINE_LABEL_REGEX = /^([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]{1,32}):\s+(.+)$/;

/**
 * Splits raw pasted or unstructured text into ScriptBlock[].
 * Supports explicit separators (`---`), markdown/bracketed headings, or blank-line paragraphs.
 */
export function splitTextIntoBlocks(rawText: string): {
  blocks: ScriptBlock[];
  detectedStructure: boolean;
} {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { blocks: [], detectedStructure: false };
  }

  // 1. Explicit separator `---`
  if (/^\s*---\s*$/m.test(normalized)) {
    const sections = normalized
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);

    const blocks: ScriptBlock[] = sections.map((section, idx) => {
      const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines[0].length <= 45) {
        return {
          id: createId('blk'),
          title: lines[0].replace(/^#+\s*/, ''),
          text: lines.slice(1).join('\n')
        };
      }
      return {
        id: createId('blk'),
        title: `Bloque ${idx + 1}`,
        text: section
      };
    });
    return { blocks, detectedStructure: true };
  }

  // 2. Line-by-line heading detection
  const lines = normalized.split('\n');
  const blocks: ScriptBlock[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let headingCount = 0;

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (text || currentTitle) {
      blocks.push({
        id: createId('blk'),
        title: currentTitle || `Bloque ${blocks.length + 1}`,
        text
      });
    }
    currentTitle = null;
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentLines.length > 0 && currentLines[currentLines.length - 1] !== '') {
        currentLines.push('');
      }
      continue;
    }

    const headingMatch = line.match(HEADING_PREFIX_REGEX);
    if (headingMatch) {
      if (currentLines.some((l) => l.trim() !== '') || currentTitle) {
        flush();
      }
      currentTitle = (headingMatch[1] || headingMatch[2] || line.replace(/^#+\s*/, '')).trim();
      headingCount++;
      continue;
    }

    const inlineMatch = line.match(INLINE_LABEL_REGEX);
    if (inlineMatch && /^(gancho|escena|bloque|parte|intro|desarrollo|diálogo|dialogo|cierre|cta|indicaci[oó]n)/i.test(inlineMatch[1])) {
      if (currentLines.some((l) => l.trim() !== '') || currentTitle) {
        flush();
      }
      currentTitle = inlineMatch[1].trim();
      currentLines.push(inlineMatch[2].trim());
      headingCount++;
      continue;
    }

    currentLines.push(line);
  }
  flush();

  if (headingCount >= 2 && blocks.length >= 2) {
    return { blocks, detectedStructure: true };
  }

  // 3. Fallback: split by double newlines if multiple paragraphs exist
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return {
      blocks: paragraphs.map((p, idx) => ({
        id: createId('blk'),
        title: `Bloque ${idx + 1}`,
        text: p
      })),
      detectedStructure: false
    };
  }

  return {
    blocks: [
      {
        id: createId('blk'),
        title: 'Bloque 1',
        text: normalized
      }
    ],
    detectedStructure: false
  };
}
