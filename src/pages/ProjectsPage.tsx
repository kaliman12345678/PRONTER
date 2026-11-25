import { useState } from 'react';
import { ChevronRight, FolderPlus, Trash2 } from 'lucide-react';
import type { Project } from '../types/models';

interface Props {
  projects: Project[];
  pieceCounts: Record<string, number>;
  onCreateProject: (name: string, description: string) => Promise<void>;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export function ProjectsPage({
  projects,
  pieceCounts,
  onCreateProject,
  onOpenProject,
  onDeleteProject
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateProject(name.trim(), description.trim());
    setName('');
    setDescription('');
    setShowForm(false);
  };

  return (
    <div className="page-content">
      <div className="row-between">
        <h2 className="section-title">Mis proyectos</h2>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <FolderPlus size={16} />
          Nuevo proyecto
        </button>
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
                    <span className="badge" style={{ marginTop: 8 }}>
                      {count} {count === 1 ? 'pieza de contenido' : 'piezas de contenido'}
                    </span>
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
