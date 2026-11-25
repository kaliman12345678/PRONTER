import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardPaste,
  Copy,
  Edit3,
  Play,
  Plus,
  Save,
  Scissors,
  Trash2
} from 'lucide-react';
import { createId } from '../db/database';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type ScriptBlock,
  type ScriptDocument
} from '../types/models';
import { copyToClipboard, readFromClipboard } from '../utils/clipboard';
import { splitTextIntoBlocks } from '../utils/textSplitter';

interface Props {
  document: ScriptDocument;
  onSaveDocument: (doc: ScriptDocument) => Promise<void>;
  onOpenTeleprompter: (selectedBlockIds: string[]) => void;
  onNotify: (message: string) => void;
}

export function DocumentEditorPage({
  document,
  onSaveDocument,
  onOpenTeleprompter,
  onNotify
}: Props) {
  const [mode, setMode] = useState<'select' | 'edit'>('select');
  const [title, setTitle] = useState(document.title);
  const [type, setType] = useState<DocumentType>(document.type);
  const [blocks, setBlocks] = useState<ScriptBlock[]>(document.blocks);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(document.blocks.map((b) => b.id))
  );
  const [showPasteSplit, setShowPasteSplit] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    setTitle(document.title);
    setType(document.type);
    setBlocks(document.blocks);
    setSelectedIds(new Set(document.blocks.map((b) => b.id)));
  }, [document.id]);

  const allSelected = blocks.length > 0 && blocks.every((b) => selectedIds.has(b.id));
  const selectedCount = blocks.filter((b) => selectedIds.has(b.id)).length;

  const toggleBlock = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(blocks.map((b) => b.id)));
    }
  };

  const persistChanges = async (
    nextTitle = title,
    nextType = type,
    nextBlocks = blocks
  ) => {
    await onSaveDocument({
      ...document,
      title: nextTitle.trim() || 'Sin título',
      type: nextType,
      blocks: nextBlocks,
      updatedAt: Date.now()
    });
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setBlocks(copy);
  };

  const handleUpdateBlock = (index: number, patch: Partial<ScriptBlock>) => {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const handleAddBlock = () => {
    const newBlock: ScriptBlock = {
      id: createId('blk'),
      title: `Bloque ${blocks.length + 1}`,
      text: '',
      cues: ''
    };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedIds((prev) => new Set(prev).add(newBlock.id));
  };

  const handleDeleteBlock = (index: number) => {
    const removed = blocks[index];
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    if (removed) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(removed.id);
        return next;
      });
    }
  };

  const handleSplitPastedText = () => {
    const result = splitTextIntoBlocks(pasteText);
    if (result.blocks.length === 0) return;
    const nextBlocks = [...blocks, ...result.blocks];
    setBlocks(nextBlocks);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      result.blocks.forEach((b) => next.add(b.id));
      return next;
    });
    setPasteText('');
    setShowPasteSplit(false);
  };

  const handleOpenPrompter = () => {
    const orderedIds = blocks.filter((b) => selectedIds.has(b.id)).map((b) => b.id);
    if (orderedIds.length === 0) return;
    onOpenTeleprompter(orderedIds);
  };

  const handleCopySelectedBlocks = async () => {
    const selected = blocks.filter((b) => selectedIds.has(b.id));
    if (selected.length === 0) return;
    const text = selected
      .map((b) => `${b.title}:\n${b.text}`)
      .join('\n\n---\n\n');
    const ok = await copyToClipboard(text);
    onNotify(ok ? 'Texto copiado al portapapeles' : 'No se pudo copiar automáticamente');
  };

  const handleCopySingleBlock = async (block: ScriptBlock) => {
    const ok = await copyToClipboard(block.text || block.title);
    onNotify(ok ? `"${block.title}" copiado` : 'No se pudo copiar');
  };

  const handlePasteIntoSplit = async () => {
    const clip = await readFromClipboard();
    if (clip === null) {
      onNotify('Mantén presionado en el cuadro y toca "Pegar"');
      return;
    }
    if (!clip.trim()) {
      onNotify('El portapapeles está vacío');
      return;
    }
    setPasteText((prev) => (prev.trim() ? `${prev.trim()}\n\n${clip.trim()}` : clip.trim()));
    onNotify('Texto pegado desde el portapapeles');
  };

  return (
    <div className="page-content">
      <div className="tabs">
        <button
          type="button"
          className={`tab-btn ${mode === 'select' ? 'active' : ''}`}
          onClick={() => setMode('select')}
        >
          Elegir bloques y leer
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => setMode('edit')}
        >
          <Edit3 size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Editar documento
        </button>
      </div>

      {mode === 'select' ? (
        <>
          <div className="card" style={{ gap: 10 }}>
            <div className="row-between">
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll}>
                {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={selectedCount === 0}
                onClick={() => void handleCopySelectedBlocks()}
              >
                <Copy size={15} />
                Copiar texto
              </button>
            </div>
            <span className="muted">
              {selectedCount} de {blocks.length} bloques seleccionados
            </span>

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={selectedCount === 0}
              onClick={handleOpenPrompter}
            >
              <Play size={20} fill="currentColor" />
              Abrir teleprompter ({selectedCount})
            </button>
          </div>

          {blocks.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Este documento no tiene bloques todavía. Ve a &ldquo;Editar documento&rdquo; para
                agregar texto o escenas.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blocks.map((block) => {
                const isSelected = selectedIds.has(block.id);
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={`block-check-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleBlock(block.id)}
                  >
                    <span className="checkbox-box" aria-hidden="true">
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', marginBottom: 4, color: '#38bdf8' }}>
                        {block.title}
                      </strong>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{block.text}</p>
                      {block.cues && (
                        <p
                          className="muted"
                          style={{
                            margin: '8px 0 0',
                            fontSize: '0.84rem',
                            borderLeft: '2px solid #fbbf24',
                            paddingLeft: 8
                          }}
                        >
                          Indicación: {block.cues}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="field">
              <label htmlFor="edit-doc-title">Título del documento</label>
              <input
                id="edit-doc-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-doc-type">Tipo de documento</label>
              <select
                id="edit-doc-type"
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value as DocumentType)}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => void persistChanges()}
              >
                <Save size={18} />
                Guardar cambios
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPasteSplit((v) => !v)}
              >
                <Scissors size={18} />
                Pegar y dividir
              </button>
            </div>
          </div>

          {showPasteSplit && (
            <div className="card">
              <div className="field">
                <div className="row-between">
                  <label htmlFor="paste-split-area">
                    Pega tu texto (usa &ldquo;---&rdquo; o títulos como &ldquo;Gancho:&rdquo;)
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handlePasteIntoSplit()}
                  >
                    <ClipboardPaste size={15} />
                    Pegar
                  </button>
                </div>
                <textarea
                  id="paste-split-area"
                  className="textarea"
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={'Gancho:\nPrimera frase...\n\n---\n\nCierre:\nÚltima frase...'}
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSplitPastedText}
                >
                  Agregar bloques divididos
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPasteSplit(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {blocks.map((block, index) => (
            <div key={block.id} className="card">
              <div className="row-between">
                <span className="badge">Bloque {index + 1}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Copiar texto del bloque"
                    title="Copiar texto"
                    onClick={() => void handleCopySingleBlock(block)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Subir bloque"
                    disabled={index === 0}
                    onClick={() => handleMoveBlock(index, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Bajar bloque"
                    disabled={index === blocks.length - 1}
                    onClick={() => handleMoveBlock(index, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Eliminar bloque"
                    onClick={() => handleDeleteBlock(index)}
                  >
                    <Trash2 size={17} color="#f87171" />
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Título de la escena o bloque</label>
                <input
                  className="input"
                  value={block.title}
                  onChange={(e) => handleUpdateBlock(index, { title: e.target.value })}
                  placeholder="Ej. Gancho, Escena 1, Desarrollo, Cierre..."
                />
              </div>

              <div className="field">
                <label>Texto para leer en el teleprompter</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={block.text}
                  onChange={(e) => handleUpdateBlock(index, { text: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Indicaciones de grabación (opcional)</label>
                <input
                  className="input"
                  value={block.cues || ''}
                  onChange={(e) => handleUpdateBlock(index, { cues: e.target.value })}
                  placeholder="Ej. Plano medio, tono firme, pausa de 1s..."
                />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-secondary btn-block" onClick={handleAddBlock}>
            <Plus size={18} />
            Agregar bloque
          </button>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => void persistChanges()}
          >
            <Save size={18} />
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}
