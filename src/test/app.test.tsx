import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { ensureSeedData } from '../db/seed';
import {
  getAllProjects,
  getDocument,
  getDocumentsByPiece,
  getPiecesByProject,
  saveDocument
} from '../db/database';
import {
  guessExcelMapping,
  mapExcelRowsToBlocks,
  parseExcelBuffer
} from '../utils/importers/excelImporter';
import { selectBlocksForTeleprompter } from '../utils/teleprompter';
import { splitTextIntoBlocks } from '../utils/textSplitter';
import { parseReferenceVideoUrl } from '../utils/videoEmbed';
import { App } from '../App';

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => {}
}));

describe('Guion en Pantalla - Lógica y Datos', () => {
  it('precarga el ejemplo NOXA con Manifestando éxito y sus 3 documentos', async () => {
    await ensureSeedData();
    const projects = await getAllProjects();
    expect(projects.some((p) => p.name === 'NOXA')).toBe(true);

    const noxa = projects.find((p) => p.name === 'NOXA')!;
    const pieces = await getPiecesByProject(noxa.id);
    const manifestando = pieces.find((pc) => pc.title === 'Manifestando éxito');
    expect(manifestando).toBeDefined();

    const docs = await getDocumentsByPiece(manifestando!.id);
    const titles = docs.map((d) => d.title);
    expect(titles).toContain('Guion final');
    expect(titles).toContain('Estructura del reel');
    expect(titles).toContain('Libreto alternativo');

    const guion = docs.find((d) => d.title === 'Guion final')!;
    expect(guion.blocks.map((b) => b.title)).toEqual([
      'Gancho',
      'Escena 1',
      'Escena 2',
      'Cierre'
    ]);
  });

  it('filtra únicamente los bloques marcados para el teleprompter en su orden original', () => {
    const blocks = [
      { id: '1', title: 'Gancho', text: 'Texto gancho' },
      { id: '2', title: 'Escena 1', text: 'Texto escena 1' },
      { id: '3', title: 'Escena 2', text: 'Texto escena 2' },
      { id: '4', title: 'Cierre', text: 'Texto cierre' }
    ];

    const selected = selectBlocksForTeleprompter(blocks, ['4', '1']);
    expect(selected.map((b) => b.title)).toEqual(['Gancho', 'Cierre']);
  });

  it('importa hojas Excel (.xlsx) y mapea columnas a bloques', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Título', 'Texto', 'Indicaciones'],
      ['Gancho', 'Hola mundo', 'Sonreír'],
      ['Cierre', 'Sígueme', 'Señalar abajo']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Guion');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const parsed = parseExcelBuffer(out);
    expect(parsed.sheetNames).toEqual(['Guion']);

    const rows = parsed.sheets['Guion'];
    const mapping = guessExcelMapping(rows);
    expect(mapping.hasHeaderRow).toBe(true);
    expect(mapping.titleCol).toBe(0);
    expect(mapping.textCol).toBe(1);
    expect(mapping.cuesCol).toBe(2);

    const blocks = mapExcelRowsToBlocks(rows, mapping);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].title).toBe('Gancho');
    expect(blocks[0].text).toBe('Hola mundo');
    expect(blocks[0].cues).toBe('Sonreír');
    expect(blocks[1].title).toBe('Cierre');
  });

  it('divide texto pegado con encabezados o separadores ---', () => {
    const raw = `Gancho:\nPrimera línea\n\n---\n\nCierre\nÚltima línea`;
    const res = splitTextIntoBlocks(raw);
    expect(res.detectedStructure).toBe(true);
    expect(res.blocks).toHaveLength(2);
    expect(res.blocks[0].title).toBe('Gancho:');
    expect(res.blocks[1].title).toBe('Cierre');
  });

  it('parsea enlaces de video de referencia de YouTube Shorts', () => {
    const parsed = parseReferenceVideoUrl('https://youtube.com/shorts/abc123xyz');
    expect(parsed?.kind).toBe('iframe');
    expect(parsed?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/abc123xyz');
  });

  it('persiste documentos guardados en IndexedDB', async () => {
    await ensureSeedData();
    await saveDocument({
      id: 'doc-test-persist',
      pieceId: 'piece-manifestando-exito',
      title: 'Notas de prueba',
      type: 'Notas',
      blocks: [{ id: 'b1', title: 'Idea', text: 'Persistente' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const loaded = await getDocument('doc-test-persist');
    expect(loaded?.title).toBe('Notas de prueba');
    expect(loaded?.blocks[0].text).toBe('Persistente');
  });
});

describe('Guion en Pantalla - Flujo UI completo', () => {
  it('permite abrir Manifestando éxito, seleccionar solo Gancho y Cierre y leerlos seguidos en el teleprompter', async () => {
    render(<App />);

    // Home shows Manifestando éxito in quick access
    const pieceBtn = await screen.findByText('Manifestando éxito');
    fireEvent.click(pieceBtn);

    // Piece detail shows all 3 documents
    await screen.findByText('Guion final');
    expect(screen.getByText('Estructura del reel')).toBeDefined();
    expect(screen.getByText('Libreto alternativo')).toBeDefined();

    // Open Guion final
    fireEvent.click(screen.getByText('Guion final'));
    await screen.findByText('Abrir teleprompter (4)');

    // Uncheck Escena 1 and Escena 2, leaving only Gancho and Cierre
    fireEvent.click(screen.getByText('Escena 1'));
    fireEvent.click(screen.getByText('Escena 2'));

    const openBtn = await screen.findByText('Abrir teleprompter (2)');
    fireEvent.click(openBtn);

    // Teleprompter shows Gancho and Cierre back-to-back
    const block0 = await screen.findByTestId('teleprompter-block-0');
    const block1 = await screen.findByTestId('teleprompter-block-1');
    expect(block0.textContent).toContain('Gancho');
    expect(block1.textContent).toContain('Cierre');
    expect(screen.queryByTestId('teleprompter-block-2')).toBeNull();

    // Cues are hidden by default, shown when toggling Indicaciones
    expect(screen.queryByText(/Plano medio cerrado/)).toBeNull();
    fireEvent.click(screen.getByText('Indicaciones'));
    await waitFor(() => {
      expect(screen.getByText(/Plano medio cerrado/)).toBeDefined();
    });
  });
});
