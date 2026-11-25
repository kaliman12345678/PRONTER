import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileUp, FolderKanban, Home } from 'lucide-react';
import {
  createId,
  deleteDocument,
  deletePiece,
  deleteProject,
  getAllPieces,
  getAllProjects,
  getDB,
  getDocumentsByPiece,
  saveDocument,
  savePiece,
  saveProject
} from './db/database';
import { ensureSeedData } from './db/seed';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { PieceDetailPage } from './pages/PieceDetailPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TeleprompterPage } from './pages/TeleprompterPage';
import type {
  ContentPiece,
  DocumentType,
  Project,
  ScriptDocument
} from './types/models';
import { splitTextIntoBlocks } from './utils/textSplitter';
import { selectBlocksForTeleprompter } from './utils/teleprompter';

type ViewState =
  | { name: 'home' }
  | { name: 'projects' }
  | { name: 'project'; projectId: string }
  | { name: 'piece'; pieceId: string }
  | { name: 'document'; docId: string }
  | { name: 'import'; projectId?: string; pieceId?: string; mode?: 'pick' | 'paste' };

export function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewState>({ name: 'home' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [pieces, setPieces] = useState<ContentPiece[]>([]);
  const [allDocs, setAllDocs] = useState<ScriptDocument[]>([]);
  const [teleprompterState, setTeleprompterState] = useState<{
    docId: string;
    selectedIds: string[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const refreshAll = useCallback(async () => {
    const [projList, pieceList, db] = await Promise.all([
      getAllProjects(),
      getAllPieces(),
      getDB()
    ]);
    const docList = await db.getAll('documents');
    setProjects(projList);
    setPieces(pieceList);
    setAllDocs(docList.sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSeedData();
      await refreshAll();
      setReady(true);
    })();
  }, [refreshAll]);

  const pieceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pieces) {
      counts[p.projectId] = (counts[p.projectId] || 0) + 1;
    }
    return counts;
  }, [pieces]);

  const docCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDocs) {
      counts[d.pieceId] = (counts[d.pieceId] || 0) + 1;
    }
    return counts;
  }, [allDocs]);

  const activeProject =
    view.name === 'project'
      ? projects.find((p) => p.id === view.projectId)
      : view.name === 'piece'
      ? projects.find(
          (p) => p.id === pieces.find((pc) => pc.id === view.pieceId)?.projectId
        )
      : view.name === 'document'
      ? projects.find((p) => {
          const doc = allDocs.find((d) => d.id === view.docId);
          const pc = pieces.find((x) => x.id === doc?.pieceId);
          return p.id === pc?.projectId;
        })
      : undefined;

  const activePiece =
    view.name === 'piece'
      ? pieces.find((p) => p.id === view.pieceId)
      : view.name === 'document'
      ? pieces.find(
          (p) => p.id === allDocs.find((d) => d.id === view.docId)?.pieceId
        )
      : undefined;

  const activeDoc =
    view.name === 'document'
      ? allDocs.find((d) => d.id === view.docId)
      : undefined;

  const handleBack = () => {
    if (view.name === 'document' && activeDoc) {
      setView({ name: 'piece', pieceId: activeDoc.pieceId });
    } else if (view.name === 'piece' && activePiece) {
      setView({ name: 'project', projectId: activePiece.projectId });
    } else if (view.name === 'project') {
      setView({ name: 'projects' });
    } else {
      setView({ name: 'home' });
    }
  };

  const handleCreateProject = async (name: string, description = '') => {
    const now = Date.now();
    const created = await saveProject({
      id: createId('proj'),
      name,
      description: description || undefined,
      createdAt: now,
      updatedAt: now
    });
    await refreshAll();
    showToast(`Proyecto "${created.name}" creado`);
    return created;
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    await refreshAll();
    showToast('Proyecto eliminado');
  };

  const handleCreatePiece = async (
    projectId: string,
    title: string,
    referenceUrl = ''
  ) => {
    const now = Date.now();
    const created = await savePiece({
      id: createId('piece'),
      projectId,
      title,
      referenceUrl: referenceUrl || undefined,
      createdAt: now,
      updatedAt: now
    });
    await refreshAll();
    showToast(`Pieza "${created.title}" creada`);
    return created;
  };

  const handleDeletePiece = async (pieceId: string) => {
    await deletePiece(pieceId);
    await refreshAll();
    showToast('Pieza eliminada');
  };

  const handleCreateDocument = async (
    pieceId: string,
    title: string,
    type: DocumentType,
    rawText: string
  ) => {
    const now = Date.now();
    const split = splitTextIntoBlocks(rawText);
    const blocks =
      split.blocks.length > 0
        ? split.blocks
        : [{ id: createId('blk'), title: 'Gancho', text: '' }];
    const doc = await saveDocument({
      id: createId('doc'),
      pieceId,
      title,
      type,
      blocks,
      createdAt: now,
      updatedAt: now
    });
    await refreshAll();
    setView({ name: 'document', docId: doc.id });
    showToast(`Documento "${doc.title}" creado`);
  };

  const handleSaveDocument = async (doc: ScriptDocument) => {
    await saveDocument(doc);
    await refreshAll();
    showToast('Cambios guardados');
  };

  const handleDeleteDocument = async (docId: string) => {
    await deleteDocument(docId);
    await refreshAll();
    showToast('Documento eliminado');
  };

  const handleSaveReferenceUrl = async (piece: ContentPiece, url: string) => {
    await savePiece({
      ...piece,
      referenceUrl: url || undefined,
      updatedAt: Date.now()
    });
    await refreshAll();
    showToast(url ? 'Enlace de referencia guardado' : 'Enlace eliminado');
  };

  const handleUploadVideoFile = async (piece: ContentPiece, file: File) => {
    await savePiece({
      ...piece,
      videoBlob: file,
      videoFileName: file.name,
      videoMimeType: file.type,
      updatedAt: Date.now()
    });
    await refreshAll();
    showToast('Video opcional guardado en el dispositivo');
  };

  const handleRemoveVideoFile = async (piece: ContentPiece) => {
    await savePiece({
      ...piece,
      videoBlob: undefined,
      videoFileName: undefined,
      videoMimeType: undefined,
      updatedAt: Date.now()
    });
    await refreshAll();
    showToast('Video opcional eliminado');
  };

  const handleOpenPiece = async (pieceId: string) => {
    await getDocumentsByPiece(pieceId);
    setView({ name: 'piece', pieceId });
  };

  if (!ready) {
    return (
      <div className="app-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="muted">Cargando Guion en Pantalla...</p>
      </div>
    );
  }

  // Teleprompter fullscreen overlay
  if (teleprompterState) {
    const doc = allDocs.find((d) => d.id === teleprompterState.docId);
    if (doc) {
      const selectedBlocks = selectBlocksForTeleprompter(
        doc.blocks,
        teleprompterState.selectedIds
      );
      return (
        <TeleprompterPage
          documentTitle={doc.title}
          blocks={selectedBlocks}
          onExit={() => setTeleprompterState(null)}
        />
      );
    }
  }

  let headerTitle = 'Guion en Pantalla';
  let headerSubtitle: string | undefined;
  const showBack = view.name !== 'home';

  if (view.name === 'projects') {
    headerTitle = 'Mis proyectos';
  } else if (view.name === 'project' && activeProject) {
    headerTitle = activeProject.name;
    headerSubtitle = 'Proyecto';
  } else if (view.name === 'piece' && activePiece) {
    headerTitle = activePiece.title;
    headerSubtitle = activeProject ? `${activeProject.name} · Pieza de contenido` : 'Pieza';
  } else if (view.name === 'document' && activeDoc) {
    headerTitle = activeDoc.title;
    headerSubtitle = `${activeProject?.name || ''} · ${activePiece?.title || ''} · ${activeDoc.type}`;
  } else if (view.name === 'import') {
    headerTitle = 'Importar documento';
    headerSubtitle = 'Excel (.xlsx), Word (.docx) o PDF';
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        {showBack && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Volver"
            onClick={handleBack}
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="top-bar-title">
          <h1>{headerTitle}</h1>
          {headerSubtitle && <div className="top-bar-subtitle">{headerSubtitle}</div>}
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {view.name === 'home' && (
          <HomePage
            projects={projects}
            recentPieces={pieces}
            onGoProjects={() => setView({ name: 'projects' })}
            onGoImport={() => setView({ name: 'import', mode: 'pick' })}
            onGoPasteText={() => setView({ name: 'import', mode: 'paste' })}
            onOpenPiece={(pieceId) => void handleOpenPiece(pieceId)}
          />
        )}

        {view.name === 'projects' && (
          <ProjectsPage
            projects={projects}
            pieceCounts={pieceCounts}
            onCreateProject={async (name, desc) => {
              await handleCreateProject(name, desc);
            }}
            onOpenProject={(projectId) => setView({ name: 'project', projectId })}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {view.name === 'project' && activeProject && (
          <ProjectDetailPage
            project={activeProject}
            pieces={pieces.filter((p) => p.projectId === activeProject.id)}
            docCounts={docCounts}
            onCreatePiece={async (title, refUrl) => {
              await handleCreatePiece(activeProject.id, title, refUrl);
            }}
            onOpenPiece={(pieceId) => void handleOpenPiece(pieceId)}
            onDeletePiece={handleDeletePiece}
          />
        )}

        {view.name === 'piece' && activePiece && (
          <PieceDetailPage
            piece={activePiece}
            documents={allDocs.filter((d) => d.pieceId === activePiece.id)}
            onCreateDocument={(title, type, raw) =>
              handleCreateDocument(activePiece.id, title, type, raw)
            }
            onOpenDocument={(docId) => setView({ name: 'document', docId })}
            onDeleteDocument={handleDeleteDocument}
            onImportForPiece={() =>
              setView({
                name: 'import',
                projectId: activePiece.projectId,
                pieceId: activePiece.id
              })
            }
            onSaveReferenceUrl={(url) => handleSaveReferenceUrl(activePiece, url)}
            onUploadVideoFile={(file) => handleUploadVideoFile(activePiece, file)}
            onRemoveVideoFile={() => handleRemoveVideoFile(activePiece)}
          />
        )}

        {view.name === 'document' && activeDoc && (
          <DocumentEditorPage
            document={activeDoc}
            onSaveDocument={handleSaveDocument}
            onOpenTeleprompter={(selectedIds) =>
              setTeleprompterState({ docId: activeDoc.id, selectedIds })
            }
            onNotify={showToast}
          />
        )}

        {view.name === 'import' && (
          <ImportPage
            projects={projects}
            pieces={pieces}
            initialProjectId={view.projectId}
            initialPieceId={view.pieceId}
            initialMode={view.mode}
            onCreateProject={(name) => handleCreateProject(name)}
            onCreatePiece={(projId, title) => handleCreatePiece(projId, title)}
            onSaveImportedDocument={async (doc) => {
              await saveDocument(doc);
              await refreshAll();
              setView({ name: 'document', docId: doc.id });
              showToast(`"${doc.title}" guardado`);
            }}
          />
        )}
      </main>

      {toast && <div className="toast-banner">{toast}</div>}

      <nav className="bottom-nav" aria-label="Navegación principal">
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={`nav-item ${view.name === 'home' ? 'active' : ''}`}
            onClick={() => setView({ name: 'home' })}
          >
            <Home size={22} />
            <span>Inicio</span>
          </button>
          <button
            type="button"
            className={`nav-item ${
              view.name === 'projects' ||
              view.name === 'project' ||
              view.name === 'piece' ||
              view.name === 'document'
                ? 'active'
                : ''
            }`}
            onClick={() => setView({ name: 'projects' })}
          >
            <FolderKanban size={22} />
            <span>Mis proyectos</span>
          </button>
          <button
            type="button"
            className={`nav-item ${view.name === 'import' ? 'active' : ''}`}
            onClick={() => setView({ name: 'import' })}
          >
            <FileUp size={22} />
            <span>Importar</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
