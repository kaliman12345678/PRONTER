import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createId } from '../../db/database';
import type { ScriptBlock } from '../../types/models';
import { splitTextIntoBlocks } from '../textSplitter';
import type { DocumentImportResult } from './wordImporter';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

interface TextLine {
  text: string;
  fontSize: number;
}

export async function parsePdfBuffer(buffer: ArrayBuffer): Promise<DocumentImportResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;

  const allLines: TextLine[] = [];
  const fontSizes: number[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    let currentY: number | null = null;
    let currentLineParts: string[] = [];
    let currentMaxFont = 0;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      const transform = item.transform as number[];
      const y = transform ? Math.round(transform[5]) : 0;
      const fontSize = transform ? Math.abs(transform[0]) || Math.abs(transform[3]) || 12 : 12;

      if (currentY !== null && Math.abs(y - currentY) > 4) {
        const lineText = currentLineParts.join(' ').replace(/\s+/g, ' ').trim();
        if (lineText) {
          allLines.push({ text: lineText, fontSize: currentMaxFont });
          fontSizes.push(currentMaxFont);
        }
        currentLineParts = [];
        currentMaxFont = 0;
      }

      currentY = y;
      if (str.trim()) {
        currentLineParts.push(str.trim());
        if (fontSize > currentMaxFont) currentMaxFont = fontSize;
      }
    }

    const lastText = currentLineParts.join(' ').replace(/\s+/g, ' ').trim();
    if (lastText) {
      allLines.push({ text: lastText, fontSize: currentMaxFont });
      fontSizes.push(currentMaxFont);
    }
  }

  const rawText = allLines.map((l) => l.text).join('\n').trim();
  const nonWhitespaceCount = rawText.replace(/\s+/g, '').length;

  // Scanned PDF detection: no extractable text
  if (nonWhitespaceCount < 5) {
    return {
      blocks: [],
      rawText: '',
      hasClearStructure: false,
      isScanned: true
    };
  }

  // Compute median font size to detect larger headings
  const sortedSizes = [...fontSizes].sort((a, b) => a - b);
  const medianSize = sortedSizes[Math.floor(sortedSizes.length / 2)] || 12;
  const headingThreshold = medianSize * 1.18;

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

  for (const line of allLines) {
    const isLargerFont = line.fontSize >= headingThreshold && line.text.length <= 65;
    const isKeywordHeading = /^(gancho|escena\s*\d*|bloque\s*\d*|intro|introducción|desarrollo|diálogo|dialogo|cierre|cta)\s*[:\-–]?$/i.test(
      line.text
    );

    if (isLargerFont || isKeywordHeading) {
      if (currentLines.length > 0 || currentTitle) {
        flush();
      }
      currentTitle = line.text.replace(/[:\-–]+$/, '').trim();
      headingCount++;
    } else {
      currentLines.push(line.text);
    }
  }
  flush();

  if (headingCount >= 1 && blocks.length >= 1) {
    return {
      blocks,
      rawText,
      hasClearStructure: true,
      isScanned: false
    };
  }

  const split = splitTextIntoBlocks(rawText);
  return {
    blocks: split.blocks,
    rawText,
    hasClearStructure: split.detectedStructure,
    isScanned: false
  };
}
