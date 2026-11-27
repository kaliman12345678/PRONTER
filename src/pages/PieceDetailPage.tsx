import { useEffect, useState } from 'react';
import { ChevronRight, FilePlus2, FileText, FileUp, Sparkles, Trash2 } from 'lucide-react';
import { ReferenceVideoSection } from '../components/ReferenceVideoSection';
import { createId } from '../db/database';
import { generateScriptWithAI } from '../db/reellabService';
import { AI_CONFIG_CHANGED_EVENT, getActiveProviderLabel } from '../services/aiGenerator';
import {
  DOCUMENT_TYPES,
  type ContentPiece,
  type DocumentType,
  type ScriptBlock,
  type ScriptDocument
} from '../types/models';

interface Props {
  piece: ContentPiece;
  documents: ScriptDocument[];
  onCreateDocument: (title: string, type: DocumentType, rawText: string) => Promise<void>;
  onCreateDocumentWithBlocks: (
    title: string,
    type: DocumentType,
    blocks: ScriptBlock[]
  ) => Promise<void>;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onImportForPiece: () => void;
  onSaveReferenceUrl: (url: string) => Promise<void>;
  onUploadVideoFile: (file: File) => Promise<void>;
  onRemoveVideoFile: () => Promise<void>;
  onNotify: (msg: string) => void;
}

function getBadgeClass(type: DocumentType): string {
  switch (type) {
    case 'Libreto':
      return 'badge libreto';
    case 'Estructura':
      return 'badge estructura';
    case 'Notas':
      return 'badge notas';
    case 'Otro':
      return 'badge otro';
    default:
      return 'badge';
  }
}

export function PieceDetailPage({
  piece,
  documents,
  onCreateDocument,
  onCreateDocumentWithBlocks,
  onOpenDocument,
  onDeleteDocument,
  onImportForPiece,
  onSaveReferenceUrl,
  onUploadVideoFile,
  onRemoveVideoFile,
  onNotify
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('Guion');
  const [rawText, setRawText] = useState('');

  const [showAIForm, setShowAIForm] = useState(false);
  const [aiTopic, setAiTopic] = useState(piece.title);
  const [aiTone, setAiTone] = useState('Cercano, directo y natural');
  const [aiSeconds, setAiSeconds] = useState(45);
  const [aiLoading, setAiLoading] = useState(false);
  const [providerLabel, setProviderLabel] = useState(() => getActiveProviderLabel());

  useEffect(() => {
    const onChange = () => setProviderLabel(getActiveProviderLabel());
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(AI_CONFIG_CHANGED_EVENT, onChange);
  }, []);

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const generated = await generateScriptWithAI({
        titulo: piece.title,
        textoBase: aiTopic.trim(),
        tono: aiTone.trim() || undefined,
        duracionSegundos: aiSeconds
      });
      const blocks: ScriptBlock[] = generated.map((g) => ({
        id: createId('blk'),
        title: g.titulo || g.tipo,
        text: g.dialogo,
        cues: [g.plano, g.indicaciones, g.texto_pantalla ? `Pantalla: ${g.texto_pantalla}` : '']
          .filter(Boolean)
          .join(' · ') || undefined
      }));
      await onCreateDocumentWithBlocks('Guion generado con IA', 'Guion', blocks);
      setShowAIForm(false);
      onNotify(`Guion generado con ${getActiveProviderLabel()}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo generar el guion');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateDocument(title.trim(), type, rawText);
    setTitle('');
    setType('Guion');
    setRawText('');
    setShowForm(false);
  };

  return (
    <div className="page-content">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Documentos escritos</h2>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowAIForm((v) => !v);
              setShowForm(false);
            }}
          >
            <Sparkles size={15} color="#a78bfa" />
            Con IA
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onImportForPiece}>
            <FileUp size={16} />
            Importar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setShowForm((v) => !v);
              setShowAIForm(false);
            }}
          >
            <FilePlus2 size={16} />
            Nuevo
          </button>
        </div>
      </div>

      {showAIForm && (
        <form onSubmit={handleGenerateAI} className="card">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
            <div className="row">
              <Sparkles size={18} color="#a78bfa" />
              <strong>Generar guion con Experto IA</strong>
            </div>
            <span className="badge estructura">{providerLabel}</span>
          </div>
          <div className="field">
            <label htmlFor="ai-topic">¿De qué trata el video o qué quieres decir?</label>
            <textarea
              id="ai-topic"
              className="textarea"
              rows={3}
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              required
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ai-tone">Tono</label>
              <input
                id="ai-tone"
                className="input"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
              />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label htmlFor="ai-dur">Duración (s)</label>
              <select
                id="ai-dur"
                className="select"
                value={aiSeconds}
                onChange={(e) => setAiSeconds(Number(e.target.value))}
              >
                <option value={30}>30 s</option>
                <option value={45}>45 s</option>
                <option value={60}>60 s</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={aiLoading}>
              <Sparkles size={16} />
              {aiLoading ? 'Generando guion...' : 'Generar guion'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAIForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="doc-title">Título del documento</label>
            <input
              id="doc-title"
              className="input"
              placeholder="Ej. Guion final, Estructura del reel..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="doc-type">Tipo de documento</label>
            <select
              id="doc-type"
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
          <div className="field">
            <label htmlFor="doc-raw">
              Pegar texto (opcional — puedes usar &ldquo;---&rdquo; para separar bloques)
            </label>
            <textarea
              id="doc-raw"
              className="textarea"
              placeholder={'Gancho:\nTu frase inicial...\n\nCierre:\nLlamado a la acción...'}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Crear documento
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {documents.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Esta pieza aún no tiene documentos. Crea uno desde cero, pega texto o importa un
            archivo Excel, Word o PDF.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {documents.map((doc) => (
            <div key={doc.id} className="row" style={{ alignItems: 'stretch' }}>
              <button
                type="button"
                className="card-interactive"
                onClick={() => onOpenDocument(doc.id)}
                style={{ flex: 1 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span className={getBadgeClass(doc.type)}>{doc.type}</span>
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      {doc.blocks.length} {doc.blocks.length === 1 ? 'bloque' : 'bloques'}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <FileText size={17} color="#94a3b8" />
                    <strong style={{ fontSize: '1.05rem' }}>{doc.title}</strong>
                  </div>
                </div>
                <ChevronRight size={20} color="#94a3b8" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Eliminar documento ${doc.title}`}
                title="Eliminar documento"
                onClick={() => {
                  if (window.confirm(`¿Eliminar el documento "${doc.title}"?`)) {
                    void onDeleteDocument(doc.id);
                  }
                }}
              >
                <Trash2 size={18} color="#f87171" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ReferenceVideoSection
        piece={piece}
        onSaveReferenceUrl={onSaveReferenceUrl}
        onUploadVideoFile={onUploadVideoFile}
        onRemoveVideoFile={onRemoveVideoFile}
      />
    </div>
  );
}
