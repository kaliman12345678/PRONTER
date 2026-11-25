import { useState } from 'react';
import { ChevronRight, Clapperboard, Plus, Trash2 } from 'lucide-react';
import type { ContentPiece, Project } from '../types/models';

interface Props {
  project: Project;
  pieces: ContentPiece[];
  docCounts: Record<string, number>;
  onCreatePiece: (title: string, referenceUrl: string) => Promise<void>;
  onOpenPiece: (pieceId: string) => void;
  onDeletePiece: (pieceId: string) => Promise<void>;
}

export function ProjectDetailPage({
  project,
  pieces,
  docCounts,
  onCreatePiece,
  onOpenPiece,
  onDeletePiece
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreatePiece(title.trim(), referenceUrl.trim());
    setTitle('');
    setReferenceUrl('');
    setShowForm(false);
  };

  return (
    <div className="page-content">
      {project.description && <p className="muted" style={{ margin: 0 }}>{project.description}</p>}

      <div className="row-between">
        <h2 className="section-title">Piezas de contenido</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={16} />
          Nueva pieza
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="piece-title">Nombre de la pieza o video a grabar</label>
            <input
              id="piece-title"
              className="input"
              placeholder="Ej. Manifestando éxito"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="piece-url">Enlace de video de referencia (opcional)</label>
            <input
              id="piece-url"
              type="url"
              className="input"
              placeholder="https://youtube.com/shorts/..."
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Crear pieza
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

      {pieces.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No hay piezas de contenido en {project.name}. Crea una para reunir sus guiones,
            libretos y estructuras.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pieces.map((piece) => {
            const count = docCounts[piece.id] || 0;
            return (
              <div key={piece.id} className="row" style={{ alignItems: 'stretch' }}>
                <button
                  type="button"
                  className="card-interactive"
                  onClick={() => onOpenPiece(piece.id)}
                  style={{ flex: 1 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Clapperboard size={18} color="#38bdf8" />
                      <strong style={{ fontSize: '1.05rem' }}>{piece.title}</strong>
                    </div>
                    <span className="muted" style={{ display: 'block', marginTop: 4 }}>
                      {count} {count === 1 ? 'documento escrito' : 'documentos escritos'}
                    </span>
                  </div>
                  <ChevronRight size={20} color="#94a3b8" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Eliminar pieza ${piece.title}`}
                  title="Eliminar pieza"
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Eliminar la pieza "${piece.title}" y todos sus documentos?`
                      )
                    ) {
                      void onDeletePiece(piece.id);
                    }
                  }}
                >
                  <Trash2 size={18} color="#f87171" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
