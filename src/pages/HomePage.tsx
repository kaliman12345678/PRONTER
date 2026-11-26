import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  ClipboardPaste,
  FileUp,
  FolderKanban,
  Lightbulb,
  Sparkles,
  Wand2,
  WifiOff
} from 'lucide-react';
import type { ContentPiece, Project } from '../types/models';

interface Props {
  projects: Project[];
  recentPieces: ContentPiece[];
  onGoProjects: () => void;
  onGoImport: () => void;
  onGoPasteText: () => void;
  onGoIdeas: () => void;
  onGoScripts: () => void;
  onGoHooks: () => void;
  onOpenProcess: () => void;
  onOpenPiece: (pieceId: string) => void;
}

export function HomePage({
  projects,
  recentPieces,
  onGoProjects,
  onGoImport,
  onGoPasteText,
  onGoIdeas,
  onGoScripts,
  onGoHooks,
  onOpenProcess,
  onOpenPiece
}: Props) {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="page-content">
      <div className="hero-grid">
        <button type="button" className="hero-card primary" onClick={onGoProjects}>
          <FolderKanban size={30} color="#38bdf8" />
          <h2>Mis proyectos</h2>
          <p>
            Organiza tus piezas de contenido, guiones, libretos y estructuras. ({projects.length}{' '}
            {projects.length === 1 ? 'proyecto' : 'proyectos'})
          </p>
        </button>

        <button type="button" className="hero-card secondary" onClick={onGoImport}>
          <FileUp size={30} color="#a78bfa" />
          <h2>Importar documento</h2>
          <p>Trae guiones desde Excel (.xlsx), Word (.docx), PDF o texto pegado.</p>
        </button>
      </div>

      <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={onGoPasteText}>
        <ClipboardPaste size={20} color="#38bdf8" />
        Pegar texto rápido desde el celular
      </button>

      <div className="row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onGoIdeas}
        >
          <Lightbulb size={18} color="#fbbf24" />
          Banco de Ideas
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onGoScripts}
        >
          <Clapperboard size={18} color="#a78bfa" />
          Guiones
        </button>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onGoHooks}
        >
          <Wand2 size={18} color="#34d399" />
          49 Ganchos y CTA
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onOpenProcess}
        >
          <BookOpen size={18} color="#38bdf8" />
          Guía de Proceso
        </button>
      </div>

      {recentPieces.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 className="section-title">Acceso rápido para grabar</h3>
          {recentPieces.slice(0, 5).map((piece) => (
            <button
              key={piece.id}
              type="button"
              className="card-interactive"
              onClick={() => onOpenPiece(piece.id)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                  <span className="badge">{projectNameById.get(piece.projectId) || 'Proyecto'}</span>
                </div>
                <strong style={{ fontSize: '1.05rem', display: 'block' }}>{piece.title}</strong>
              </div>
              <ChevronRight size={20} color="#94a3b8" />
            </button>
          ))}
        </section>
      )}

      <div className="card" style={{ gap: 8 }}>
        <div className="row">
          <Sparkles size={18} color="#38bdf8" />
          <strong>Listo para usar sin conexión</strong>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Tus guiones y preferencias se guardan directamente en este dispositivo, sin cuentas ni
          servidores externos. Puedes instalar esta app en tu celular desde el menú del navegador
          (&ldquo;Agregar a pantalla de inicio&rdquo;).
        </p>
        <div className="row muted" style={{ fontSize: '0.82rem' }}>
          <WifiOff size={15} />
          <span>Funciona offline después de la primera carga.</span>
        </div>
      </div>
    </div>
  );
}
