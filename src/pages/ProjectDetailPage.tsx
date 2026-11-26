import { useState } from 'react';
import {
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Edit3,
  Plus,
  Save,
  Share2,
  Trash2,
  User,
  X
} from 'lucide-react';
import type { ContentPiece, Project } from '../types/models';
import { copyToClipboard } from '../utils/clipboard';

interface Props {
  project: Project;
  pieces: ContentPiece[];
  docCounts: Record<string, number>;
  activeUserName?: string;
  onUpdateProject: (project: Project) => Promise<void>;
  onCreatePiece: (title: string, referenceUrl: string) => Promise<void>;
  onOpenPiece: (pieceId: string) => void;
  onDeletePiece: (pieceId: string) => Promise<void>;
  onGenerateShareLink: (projectId: string) => Promise<string | null>;
  onDownloadProjectJson: (projectId: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

export function ProjectDetailPage({
  project,
  pieces,
  docCounts,
  activeUserName = '',
  onUpdateProject,
  onCreatePiece,
  onOpenPiece,
  onDeletePiece,
  onGenerateShareLink,
  onDownloadProjectJson,
  onNotify
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description || '');
  const [editOwner, setEditOwner] = useState(project.ownerName || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreatePiece(title.trim(), referenceUrl.trim());
    setTitle('');
    setReferenceUrl('');
    setShowForm(false);
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const url = await onGenerateShareLink(project.id);
      if (url) {
        setShareUrl(url);
        const ok = await copyToClipboard(url);
        if (ok) {
          onNotify('Enlace copiado al portapapeles');
        }
      }
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleSaveProjectMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    await onUpdateProject({
      ...project,
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      ownerName: editOwner.trim() || undefined,
      updatedAt: Date.now()
    });
    setEditingProject(false);
  };

  return (
    <div className="page-content">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {project.ownerName ? (
            <span className="badge estructura">
              <User size={13} />
              Responsable: {project.ownerName}
            </span>
          ) : (
            <span className="muted">Sin responsable asignado</span>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {activeUserName && project.ownerName !== activeUserName && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                void onUpdateProject({
                  ...project,
                  ownerName: activeUserName,
                  updatedAt: Date.now()
                })
              }
            >
              <User size={14} />
              Asignarme
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditName(project.name);
              setEditDesc(project.description || '');
              setEditOwner(project.ownerName || '');
              setEditingProject((v) => !v);
            }}
          >
            <Edit3 size={14} />
            Editar
          </button>
        </div>
      </div>

      {project.description && !editingProject && (
        <p className="muted" style={{ margin: 0 }}>{project.description}</p>
      )}

      {editingProject && (
        <form onSubmit={handleSaveProjectMeta} className="card">
          <div className="field">
            <label htmlFor="edit-proj-name">Nombre del proyecto</label>
            <input
              id="edit-proj-name"
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="edit-proj-desc">Descripción (opcional)</label>
            <input
              id="edit-proj-desc"
              className="input"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-proj-owner">Responsable</label>
            <input
              id="edit-proj-owner"
              className="input"
              value={editOwner}
              onChange={(e) => setEditOwner(e.target.value)}
              placeholder="Nombre del responsable"
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
              <Save size={15} />
              Guardar proyecto
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditingProject(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          disabled={generatingLink}
          onClick={() => void handleGenerateLink()}
        >
          <Share2 size={16} color="#38bdf8" />
          {generatingLink ? 'Generando enlace...' : 'Copiar enlace para celular'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void onDownloadProjectJson(project.id)}
          title="Descargar respaldo .json"
        >
          <Download size={16} />
          Respaldo .json
        </button>
      </div>

      {shareUrl && (
        <div className="card" style={{ gap: 10 }}>
          <div className="row-between">
            <strong>Enlace para abrir en tu celular</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Cerrar enlace"
              onClick={() => setShareUrl(null)}
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            className="textarea"
            rows={3}
            readOnly
            value={shareUrl}
            onClick={(e) => e.currentTarget.select()}
          />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={() => {
                void copyToClipboard(shareUrl).then((ok) =>
                  onNotify(
                    ok
                      ? 'Enlace copiado. Pégalo en WhatsApp y ábrelo en el celular'
                      : 'Toca el cuadro de arriba y copia el enlace manualmente'
                  )
                );
              }}
            >
              <Copy size={15} />
              Copiar enlace
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void navigator.share({
                    title: `Proyecto ${project.name} - Guion en Pantalla`,
                    url: shareUrl
                  });
                }}
              >
                <Share2 size={15} />
                Enviar
              </button>
            )}
          </div>
        </div>
      )}

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
