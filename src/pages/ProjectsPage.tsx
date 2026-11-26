import { useEffect, useState } from 'react';
import { ChevronRight, FolderPlus, Trash2, Upload, User } from 'lucide-react';
import type { Project } from '../types/models';

interface Props {
  projects: Project[];
  pieceCounts: Record<string, number>;
  activeUserName?: string;
  onCreateProject: (name: string, description: string, ownerName: string) => Promise<void>;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
  onImportProjectJson: (file: File) => Promise<void>;
}

export function ProjectsPage({
  projects,
  pieceCounts,
  activeUserName = '',
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onImportProjectJson
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerName, setOwnerName] = useState(activeUserName);

  useEffect(() => {
    if (!ownerName && activeUserName) {
      setOwnerName(activeUserName);
    }
  }, [activeUserName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateProject(name.trim(), description.trim(), ownerName.trim());
    setName('');
    setDescription('');
    setOwnerName(activeUserName);
    setShowForm(false);
  };

  return (
    <div className="page-content">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Mis proyectos</h2>
        <div className="row" style={{ gap: 8 }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={15} />
            Cargar .json
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportProjectJson(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <FolderPlus size={16} />
            Nuevo proyecto
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="proj-name">Nombre del proyecto</label>
            <input
              id="proj-name"
              className="input"
              placeholder="Ej. NOXA, Canal YouTube, Podcast..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="proj-desc">Descripción (opcional)</label>
            <input
              id="proj-desc"
              className="input"
              placeholder="Ej. Reels de mentalidad y productividad"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="proj-owner">Responsable del proyecto</label>
            <input
              id="proj-owner"
              className="input"
              placeholder="Ej. Tu nombre"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Crear proyecto
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

      {projects.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Aún no tienes proyectos. Crea el primero para organizar tus piezas de contenido y
            guiones.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map((project) => {
            const count = pieceCounts[project.id] || 0;
            return (
              <div key={project.id} className="row" style={{ alignItems: 'stretch' }}>
                <button
                  type="button"
                  className="card-interactive"
                  onClick={() => onOpenProject(project.id)}
                  style={{ flex: 1 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '1.08rem', display: 'block' }}>
                      {project.name}
                    </strong>
                    {project.description && (
                      <span className="muted" style={{ display: 'block', marginTop: 2 }}>
                        {project.description}
                      </span>
                    )}
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <span className="badge">
                        {count} {count === 1 ? 'pieza de contenido' : 'piezas de contenido'}
                      </span>
                      {project.ownerName && (
                        <span className="badge estructura">
                          <User size={12} />
                          {project.ownerName}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} color="#94a3b8" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Eliminar proyecto ${project.name}`}
                  title="Eliminar proyecto"
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Eliminar el proyecto "${project.name}" y todas sus piezas y documentos?`
                      )
                    ) {
                      void onDeleteProject(project.id);
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
