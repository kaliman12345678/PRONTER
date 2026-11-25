import mammoth from 'mammoth';
import { createId } from '../../db/database';
import type { ScriptBlock } from '../../types/models';
import { splitTextIntoBlocks } from '../textSplitter';

export interface DocumentImportResult {
  blocks: ScriptBlock[];
  rawText: string;
  hasClearStructure: boolean;
  isScanned?: boolean;
}

export async function parseWordBuffer(buffer: ArrayBuffer): Promise<DocumentImportResult> {
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  const rawText = (rawResult.value || '').trim();

  if (!rawText) {
    return {
      blocks: [],
      rawText: '',
      hasClearStructure: false
    };
  }

  // Parse HTML to detect headings (h1-h4) or bold-only short paragraphs
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResult.value || '', 'text/html');
  const elements = Array.from(doc.body.children);

  const blocks: ScriptBlock[] = [];
  let currentTitle: string | null = null;
  let currentParagraphs: string[] = [];
  let headingCount = 0;

  const flush = () => {
    const text = currentParagraphs.join('\n\n').trim();
    if (text || currentTitle) {
      blocks.push({
        id: createId('blk'),
        title: currentTitle || `Bloque ${blocks.length + 1}`,
        text
      });
    }
    currentTitle = null;
    currentParagraphs = [];
  };

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const textContent = (el.textContent || '').trim();
    if (!textContent) continue;

    const isHeadingTag = /^h[1-4]$/.test(tag);
    const isBoldOnlyParagraph =
      tag === 'p' &&
      el.children.length === 1 &&
      (el.children[0].tagName.toLowerCase() === 'strong' || el.children[0].tagName.toLowerCase() === 'b') &&
      textContent.length <= 55;

    if (isHeadingTag || isBoldOnlyParagraph) {
      if (currentParagraphs.length > 0 || currentTitle) {
        flush();
      }
      currentTitle = textContent.replace(/[:\-–]+$/, '').trim();
      headingCount++;
    } else {
      currentParagraphs.push(textContent);
    }
  }
  flush();

  if (headingCount >= 1 && blocks.length >= 1) {
    return {
      blocks,
      rawText,
      hasClearStructure: true
    };
  }

  // Fallback to textSplitter heuristics
  const split = splitTextIntoBlocks(rawText);
  return {
    blocks: split.blocks,
    rawText,
    hasClearStructure: split.detectedStructure
  };
}
