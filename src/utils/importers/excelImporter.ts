import * as XLSX from 'xlsx';
import { createId } from '../../db/database';
import type { ScriptBlock } from '../../types/models';

export interface ExcelWorkbookData {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
}

export interface ExcelColumnMapping {
  hasHeaderRow: boolean;
  titleCol: number | null;
  textCol: number;
  cuesCol: number | null;
}

export function parseExcelBuffer(buffer: ArrayBuffer): ExcelWorkbookData {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: Record<string, string[][]> = {};

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false
    });
    sheets[name] = rows.map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []
    );
  }

  return {
    sheetNames: workbook.SheetNames,
    sheets
  };
}

export function guessExcelMapping(rows: string[][]): ExcelColumnMapping {
  if (rows.length === 0) {
    return { hasHeaderRow: false, titleCol: null, textCol: 0, cuesCol: null };
  }

  const firstRow = rows[0].map((c) => c.toLowerCase());
  let titleCol: number | null = null;
  let textCol: number | null = null;
  let cuesCol: number | null = null;

  firstRow.forEach((cell, idx) => {
    if (titleCol === null && /(t[ií]tulo|escena|bloque|secci[oó]n|parte|nombre)/i.test(cell)) {
      titleCol = idx;
    } else if (textCol === null && /(texto|guion|guión|di[aá]logo|locuci[oó]n|contenido|leer)/i.test(cell)) {
      textCol = idx;
    } else if (cuesCol === null && /(indicaci|nota|cámara|camara|plano|direcci|accion|acción)/i.test(cell)) {
      cuesCol = idx;
    }
  });

  const hasHeaderRow = titleCol !== null || textCol !== null || cuesCol !== null;
  const maxCols = Math.max(...rows.map((r) => r.length), 1);

  if (textCol === null) {
    if (maxCols >= 2 && titleCol === 0) {
      textCol = 1;
    } else if (maxCols >= 2 && titleCol === null) {
      titleCol = 0;
      textCol = 1;
    } else {
      textCol = 0;
    }
  }

  return {
    hasHeaderRow,
    titleCol,
    textCol,
    cuesCol
  };
}

export function mapExcelRowsToBlocks(
  rows: string[][],
  mapping: ExcelColumnMapping
): ScriptBlock[] {
  const startIdx = mapping.hasHeaderRow ? 1 : 0;
  const blocks: ScriptBlock[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const text = (row[mapping.textCol] ?? '').trim();
    const title = mapping.titleCol !== null ? (row[mapping.titleCol] ?? '').trim() : '';
    const cues = mapping.cuesCol !== null ? (row[mapping.cuesCol] ?? '').trim() : '';

    if (!text && !title && !cues) continue;

    blocks.push({
      id: createId('blk'),
      title: title || `Bloque ${blocks.length + 1}`,
      text,
      cues: cues || undefined
    });
  }

  return blocks;
}
