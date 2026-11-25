import { useState } from 'react';
import { ChevronRight, FilePlus2, FileText, FileUp, Trash2 } from 'lucide-react';
import { ReferenceVideoSection } from '../components/ReferenceVideoSection';
import { DOCUMENT_TYPES, type ContentPiece, type DocumentType, type ScriptDocument } from '../types/models';

interface Props {
  piece: ContentPiece;
  documents: ScriptDocument[];
  onCreateDocument: (title: string, type: DocumentType, rawText: string) => Promise<void>;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onImportForPiece: () => void;
  onSaveReferenceUrl: (url: string) => Promise<void>;
  onUploadVideoFile: (file: File) => Promise<void>;
  onRemoveVideoFile: () => Promise<void>;
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
  onOpenDocument,
  onDeleteDocument,
  onImportForPiece,
  onSaveReferenceUrl,
  onUploadVideoFile,
  onRemoveVideoFile
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('Guion');
  const [rawText, setRawText] = useState('');

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
      <div className="row-between">
        <h2 className="section-title">Documentos escritos</h2>
        <div className="row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onImportForPiece}>
            <FileUp size={16} />
            Importar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <FilePlus2 size={16} />
            Nuevo
          </button>
        </div>
      </div>

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
