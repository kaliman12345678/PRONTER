import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  FileUp,
  Plus,
  Save,
  Scissors,
  Trash2
} from 'lucide-react';
import { createId } from '../db/database';
import {
  DOCUMENT_TYPES,
  type ContentPiece,
  type DocumentType,
  type Project,
  type ScriptBlock,
  type ScriptDocument
} from '../types/models';
import {
  guessExcelMapping,
  mapExcelRowsToBlocks,
  parseExcelBuffer,
  type ExcelColumnMapping,
  type ExcelWorkbookData
} from '../utils/importers/excelImporter';
import { parsePdfBuffer } from '../utils/importers/pdfImporter';
import { parseWordBuffer } from '../utils/importers/wordImporter';
import { readFromClipboard } from '../utils/clipboard';
import { splitTextIntoBlocks } from '../utils/textSplitter';

interface Props {
  projects: Project[];
  pieces: ContentPiece[];
  initialProjectId?: string;
  initialPieceId?: string;
  initialMode?: 'pick' | 'paste';
  onCreateProject: (name: string) => Promise<Project>;
  onCreatePiece: (projectId: string, title: string) => Promise<ContentPiece>;
  onSaveImportedDocument: (doc: ScriptDocument) => Promise<void>;
}

type ImportStep = 'pick' | 'excel-map' | 'manual-split' | 'review';

export function ImportPage({
  projects,
  pieces,
  initialProjectId,
  initialPieceId,
  initialMode = 'pick',
  onCreateProject,
  onCreatePiece,
  onSaveImportedDocument
}: Props) {
  const [step, setStep] = useState<ImportStep>(
    initialMode === 'paste' ? 'manual-split' : 'pick'
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [loading, setLoading] = useState(false);

  // Excel state
  const [excelData, setExcelData] = useState<ExcelWorkbookData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelMapping, setExcelMapping] = useState<ExcelColumnMapping>({
    hasHeaderRow: true,
    titleCol: 0,
    textCol: 1,
    cuesCol: null
  });

  // Unstructured / manual text state
  const [manualText, setManualText] = useState('');

  // Review & target metadata
  const [docTitle, setDocTitle] = useState(initialMode === 'paste' ? 'Guion pegado' : '');
  const [docType, setDocType] = useState<DocumentType>('Guion');
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);

  const [targetProjectId, setTargetProjectId] = useState<string>(
    initialProjectId || projects[0]?.id || '__new__'
  );
  const [newProjectName, setNewProjectName] = useState('');

  const projectPieces = pieces.filter((p) => p.projectId === targetProjectId);
  const [targetPieceId, setTargetPieceId] = useState<string>(
    initialPieceId || projectPieces[0]?.id || '__new__'
  );
  const [newPieceTitle, setNewPieceTitle] = useState('');

  useEffect(() => {
    if (targetProjectId === '__new__') {
      setTargetPieceId('__new__');
      return;
    }
    const matching = pieces.filter((p) => p.projectId === targetProjectId);
    if (matching.length > 0 && !matching.some((p) => p.id === targetPieceId)) {
      setTargetPieceId(matching[0].id);
    } else if (matching.length === 0) {
      setTargetPieceId('__new__');
    }
  }, [targetProjectId, pieces]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setErrorMsg(null);
    setStatusMsg(null);
    setIsScannedPdf(false);
    setLoading(true);

    const baseName = file.name.replace(/\.[^.]+$/, '');
    setDocTitle(baseName);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const buffer = await file.arrayBuffer();

      if (ext === 'xlsx' || ext === 'xls') {
        const parsed = parseExcelBuffer(buffer);
        if (parsed.sheetNames.length === 0) {
          throw new Error('El archivo Excel no contiene hojas.');
        }
        const firstSheet = parsed.sheetNames[0];
        const rows = parsed.sheets[firstSheet] || [];
        setExcelData(parsed);
        setSelectedSheet(firstSheet);
        setExcelMapping(guessExcelMapping(rows));
        setStep('excel-map');
      } else if (ext === 'docx') {
        const result = await parseWordBuffer(buffer);
        if (!result.rawText) {
          setManualText('');
          setStatusMsg('El archivo Word parece vacío. Puedes pegar tu texto aquí.');
          setStep('manual-split');
        } else if (result.hasClearStructure && result.blocks.length > 0) {
          setBlocks(result.blocks);
          setStatusMsg(
            `Se detectaron ${result.blocks.length} bloques desde los encabezados del Word.`
          );
          setStep('review');
        } else {
          setManualText(result.rawText);
          setStatusMsg(
            'No se detectó una estructura clara de encabezados. Edita o divide el texto manualmente.'
          );
          setStep('manual-split');
        }
      } else if (ext === 'pdf') {
        const result = await parsePdfBuffer(buffer);
        if (result.isScanned) {
          setIsScannedPdf(true);
          setManualText('');
          setStep('manual-split');
        } else if (result.hasClearStructure && result.blocks.length > 0) {
          setBlocks(result.blocks);
          setStatusMsg(
            `Se detectaron ${result.blocks.length} bloques desde los encabezados del PDF.`
          );
          setStep('review');
        } else {
          setManualText(result.rawText);
          setStatusMsg(
            'PDF leído, pero sin encabezados claros. Revisa el texto y divídelo manualmente.'
          );
          setStep('manual-split');
        }
      } else {
        setErrorMsg('Formato no compatible. Usa archivos .xlsx, .docx o .pdf.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `No se pudo leer el archivo: ${err.message}`
          : 'Ocurrió un error al leer el archivo.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (excelData) {
      setExcelMapping(guessExcelMapping(excelData.sheets[sheetName] || []));
    }
  };

  const handleConfirmExcelMapping = () => {
    if (!excelData) return;
    const rows = excelData.sheets[selectedSheet] || [];
    const mapped = mapExcelRowsToBlocks(rows, excelMapping);
    if (mapped.length === 0) {
      setErrorMsg('No se encontraron filas con contenido en la columna seleccionada.');
      return;
    }
    setErrorMsg(null);
    setBlocks(mapped);
    setStatusMsg(`Se prepararon ${mapped.length} bloques desde la hoja "${selectedSheet}".`);
    setStep('review');
  };

  const handleSplitManualText = () => {
    const split = splitTextIntoBlocks(manualText);
    if (split.blocks.length === 0) {
      setErrorMsg('Pega o escribe algún texto antes de continuar.');
      return;
    }
    setErrorMsg(null);
    setBlocks(split.blocks);
    setStep('review');
  };

  const handlePasteFromClipboard = async () => {
    setErrorMsg(null);
    const clip = await readFromClipboard();
    if (clip === null) {
      setErrorMsg(
        'Tu navegador no permitió leer el portapapeles automáticamente. Mantén presionado dentro del cuadro y toca "Pegar".'
      );
      return;
    }
    if (!clip.trim()) {
      setErrorMsg('El portapapeles está vacío.');
      return;
    }
    setManualText((prev) => (prev.trim() ? `${prev.trim()}\n\n${clip.trim()}` : clip.trim()));
    setStatusMsg('Texto pegado desde el portapapeles.');
  };

  const handleUpdateBlock = (index: number, patch: Partial<ScriptBlock>) => {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const handleAddBlock = () => {
    setBlocks((prev) => [
      ...prev,
      { id: createId('blk'), title: `Bloque ${prev.length + 1}`, text: '', cues: '' }
    ]);
  };

  const handleDeleteBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocks.length === 0) {
      setErrorMsg('Agrega al menos un bloque antes de guardar.');
      return;
    }

    setErrorMsg(null);
    let finalProjectId = targetProjectId;
    if (finalProjectId === '__new__') {
      if (!newProjectName.trim()) {
        setErrorMsg('Escribe el nombre del nuevo proyecto.');
        return;
      }
      const created = await onCreateProject(newProjectName.trim());
      finalProjectId = created.id;
    }

    let finalPieceId = targetPieceId;
    if (finalPieceId === '__new__') {
      if (!newPieceTitle.trim()) {
        setErrorMsg('Escribe el nombre de la nueva pieza de contenido.');
        return;
      }
      const createdPiece = await onCreatePiece(finalProjectId, newPieceTitle.trim());
      finalPieceId = createdPiece.id;
    }

    const now = Date.now();
    await onSaveImportedDocument({
      id: createId('doc'),
      pieceId: finalPieceId,
      title: docTitle.trim() || 'Documento importado',
      type: docType,
      blocks,
      createdAt: now,
      updatedAt: now
    });
  };

  const currentSheetRows = excelData?.sheets[selectedSheet] || [];
  const maxCols = currentSheetRows.reduce((m, r) => Math.max(m, r.length), 0);
  const colOptions = Array.from({ length: maxCols }, (_, idx) => {
    const headerSample = currentSheetRows[0]?.[idx];
    return {
      index: idx,
      label: headerSample
        ? `Columna ${idx + 1} (${headerSample.slice(0, 24)})`
        : `Columna ${idx + 1}`
    };
  });

  return (
    <div className="page-content">
      {errorMsg && <div className="alert danger">{errorMsg}</div>}
      {statusMsg && <div className="alert success">{statusMsg}</div>}

      {step === 'pick' && (
        <>
          <div className="card">
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Importar archivo</h2>
            <p className="muted" style={{ margin: 0 }}>
              Compatible con hojas de cálculo <strong>Excel (.xlsx)</strong>, documentos{' '}
              <strong>Word (.docx)</strong> y <strong>PDF con texto (.pdf)</strong>. Todo se
              procesa en tu dispositivo.
            </p>

            <label className="btn btn-primary btn-lg btn-block" style={{ cursor: 'pointer' }}>
              <FileUp size={20} />
              {loading ? 'Leyendo archivo...' : 'Seleccionar .xlsx, .docx o .pdf'}
              <input
                type="file"
                accept=".xlsx,.xls,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileSelected}
                disabled={loading}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div className="card">
            <div className="row">
              <ClipboardPaste size={20} color="#a78bfa" />
              <strong>¿Prefieres pegar el texto directamente?</strong>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Pega un guion desde notas, WhatsApp o un PDF escaneado y divídelo en bloques.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setIsScannedPdf(false);
                setDocTitle('Guion pegado');
                setStep('manual-split');
              }}
            >
              Pegar texto manualmente
            </button>
          </div>
        </>
      )}

      {step === 'excel-map' && excelData && (
        <div className="card">
          <div className="row-between">
            <div className="row">
              <FileSpreadsheet size={20} color="#34d399" />
              <strong>Configurar columnas de Excel</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStep('pick')}
            >
              Cambiar archivo
            </button>
          </div>

          <div className="field">
            <label htmlFor="excel-sheet">Hoja de Excel</label>
            <select
              id="excel-sheet"
              className="select"
              value={selectedSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
            >
              {excelData.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={excelMapping.hasHeaderRow}
              onChange={(e) =>
                setExcelMapping((m) => ({ ...m, hasHeaderRow: e.target.checked }))
              }
            />
            <span>La primera fila contiene encabezados</span>
          </label>

          <div className="field">
            <label htmlFor="col-title">Columna para Título del bloque (opcional)</label>
            <select
              id="col-title"
              className="select"
              value={excelMapping.titleCol ?? ''}
              onChange={(e) =>
                setExcelMapping((m) => ({
                  ...m,
                  titleCol: e.target.value === '' ? null : Number(e.target.value)
                }))
              }
            >
              <option value="">(Numerar automáticamente: Bloque 1, 2...)</option>
              {colOptions.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="col-text">Columna para Texto a leer (obligatorio)</label>
            <select
              id="col-text"
              className="select"
              value={excelMapping.textCol}
              onChange={(e) =>
                setExcelMapping((m) => ({ ...m, textCol: Number(e.target.value) }))
              }
            >
              {colOptions.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="col-cues">Columna para Indicaciones de grabación (opcional)</label>
            <select
              id="col-cues"
              className="select"
              value={excelMapping.cuesCol ?? ''}
              onChange={(e) =>
                setExcelMapping((m) => ({
                  ...m,
                  cuesCol: e.target.value === '' ? null : Number(e.target.value)
                }))
              }
            >
              <option value="">(Sin columna de indicaciones)</option>
              {colOptions.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={handleConfirmExcelMapping}
          >
            Continuar y revisar bloques
          </button>
        </div>
      )}

      {step === 'manual-split' && (
        <div className="card">
          <div className="row-between">
            <div className="row">
              <FileText size={20} color="#38bdf8" />
              <strong>Vista previa editable</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStep('pick')}
            >
              Volver
            </button>
          </div>

          {isScannedPdf && (
            <div className="alert warning">
              <div className="row" style={{ marginBottom: 4 }}>
                <AlertTriangle size={18} />
                <strong>PDF escaneado sin texto extraíble</strong>
              </div>
              Este PDF parece ser una imagen escaneada. Puedes copiar el texto desde otra app y
              pegarlo aquí abajo para dividirlo en bloques.
            </div>
          )}

          <div className="field">
            <div className="row-between">
              <label htmlFor="manual-text-area">
                Pega o edita el texto (usa <code>---</code> o títulos como <code>Gancho:</code>)
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handlePasteFromClipboard()}
              >
                <ClipboardPaste size={15} />
                Pegar del portapapeles
              </button>
            </div>
            <textarea
              id="manual-text-area"
              className="textarea"
              rows={10}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={'Gancho:\nTu frase inicial aquí...\n\n---\n\nCierre:\nTu cierre aquí...'}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={handleSplitManualText}
          >
            <Scissors size={18} />
            Dividir texto en bloques
          </button>
        </div>
      )}

      {step === 'review' && (
        <form onSubmit={handleSaveFinal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="row-between">
              <div className="row">
                <CheckCircle2 size={20} color="#34d399" />
                <strong>Dónde guardar este documento</strong>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setStep('pick')}
              >
                Otro archivo
              </button>
            </div>

            <div className="field">
              <label htmlFor="imp-doc-title">Título del documento</label>
              <input
                id="imp-doc-title"
                className="input"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="imp-doc-type">Tipo de documento</label>
              <select
                id="imp-doc-type"
                className="select"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="imp-project">Proyecto</label>
              <select
                id="imp-project"
                className="select"
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new__">+ Crear nuevo proyecto...</option>
              </select>
            </div>

            {targetProjectId === '__new__' && (
              <div className="field">
                <label htmlFor="imp-new-proj">Nombre del nuevo proyecto</label>
                <input
                  id="imp-new-proj"
                  className="input"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Ej. NOXA"
                  required
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="imp-piece">Pieza de contenido</label>
              <select
                id="imp-piece"
                className="select"
                value={targetPieceId}
                onChange={(e) => setTargetPieceId(e.target.value)}
                disabled={targetProjectId === '__new__'}
              >
                {projectPieces.map((piece) => (
                  <option key={piece.id} value={piece.id}>
                    {piece.title}
                  </option>
                ))}
                <option value="__new__">+ Crear nueva pieza de contenido...</option>
              </select>
            </div>

            {targetPieceId === '__new__' && (
              <div className="field">
                <label htmlFor="imp-new-piece">Nombre de la nueva pieza</label>
                <input
                  id="imp-new-piece"
                  className="input"
                  value={newPieceTitle}
                  onChange={(e) => setNewPieceTitle(e.target.value)}
                  placeholder="Ej. Manifestando éxito"
                  required
                />
              </div>
            )}
          </div>

          <h3 className="section-title">Revisar y corregir bloques ({blocks.length})</h3>

          {blocks.map((block, index) => (
            <div key={block.id} className="card">
              <div className="row-between">
                <span className="badge">Bloque {index + 1}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Eliminar bloque"
                  onClick={() => handleDeleteBlock(index)}
                >
                  <Trash2 size={17} color="#f87171" />
                </button>
              </div>
              <div className="field">
                <label>Título</label>
                <input
                  className="input"
                  value={block.title}
                  onChange={(e) => handleUpdateBlock(index, { title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Texto para leer</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={block.text}
                  onChange={(e) => handleUpdateBlock(index, { text: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Indicaciones (opcional)</label>
                <input
                  className="input"
                  value={block.cues || ''}
                  onChange={(e) => handleUpdateBlock(index, { cues: e.target.value })}
                />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-secondary btn-block" onClick={handleAddBlock}>
            <Plus size={18} />
            Agregar otro bloque
          </button>

          <button type="submit" className="btn btn-primary btn-lg btn-block">
            <Save size={20} />
            Guardar documento
          </button>
        </form>
      )}
    </div>
  );
}
