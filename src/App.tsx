import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  FolderKanban,
  Home,
  Lightbulb,
  RefreshCw,
  Settings,
  User,
  Wand2
} from 'lucide-react';
import {
  subscribeToCloudSync,
  syncAllWithCloud,
  type SyncStatus
} from './db/cloudSync';
import {
  createVotante,
  fetchVotantes,
  getStoredActiveUser,
  setStoredActiveUser
} from './db/reellabService';
import { StoryboardPrintModal } from './components/StoryboardPrintModal';
import { UserSelectorModal } from './components/UserSelectorModal';
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
import { HooksCtaPage } from './pages/HooksCtaPage';
import { IdeasPage } from './pages/IdeasPage';
import { ImportPage } from './pages/ImportPage';
import { PieceDetailPage } from './pages/PieceDetailPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ReelLabSettingsPage } from './pages/ReelLabSettingsPage';
import { TeleprompterPage } from './pages/TeleprompterPage';
import type {
  ContentPiece,
  DocumentType,
  Project,
  ScriptBlock,
  ScriptDocument
} from './types/models';
import type { GuionResumen, Votante } from './types/reellab';
import { splitTextIntoBlocks } from './utils/textSplitter';
import { selectBlocksForTeleprompter } from './utils/teleprompter';
import type { ParsedBatchPiece } from './utils/batchScriptParser';
import {
  buildProjectSharePayload,
  decodeProjectShareHash,
  encodeProjectShareUrl,
  importSharedProjectPayload,
  type SharedProjectPayload
} from './utils/projectShare';

type ViewState =
  | { name: 'home' }
  | { name: 'ideas' }
  | { name: 'hooks' }
  | { name: 'settings' }
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
    docId?: string;
    selectedIds?: string[];
    customTitle?: string;
    customBlocks?: ScriptBlock[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // ReelLab team user & storyboard state
  const [users, setUsers] = useState<Votante[]>([]);
  const [activeUser, setActiveUser] = useState<Votante | null>(() => getStoredActiveUser());
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [storyboardGuion, setStoryboardGuion] = useState<GuionResumen | null>(null);

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

  const runCloudSync = useCallback(
    async (silent = true) => {
      if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
      setSyncStatus('syncing');
      const res = await syncAllWithCloud();
      setSyncStatus(res.status);
      if (res.changed) {
        await refreshAll();
      }
      if (!silent) {
        if (res.status === 'synced') {
          showToast('Sincronizado con la nube');
        } else if (res.status === 'offline') {
          showToast('Sin conexión — guardado localmente');
        } else if (res.status === 'error') {
          showToast('Ejecuta el SQL de guion_sync en Supabase para activar la nube');
        }
      }
    },
    [refreshAll, showToast]
  );

  useEffect(() => {
    (async () => {
      await ensureSeedData();
      if (typeof window !== 'undefined' && window.location.hash.startsWith('#share=')) {
        try {
          const payload = await decodeProjectShareHash(window.location.hash);
          if (payload) {
            const imported = await importSharedProjectPayload(payload);
            window.history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search
            );
            await refreshAll();
            setView({ name: 'project', projectId: imported.id });
            setReady(true);
            showToast(`Proyecto "${imported.name}" importado en este dispositivo`);
            void runCloudSync(true);
            return;
          }
        } catch {
          showToast('No se pudo leer el enlace compartido');
        }
      }
      await refreshAll();
      setReady(true);
      void runCloudSync(true);
    })();
  }, [refreshAll, showToast, runCloudSync]);

  const loadUsers = useCallback(async () => {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
    const res = await fetchVotantes();
    setSchemaMissing(res.schemaMissing);
    setUsers(res.users);
    if (!res.schemaMissing && res.users.length > 0 && !getStoredActiveUser()) {
      setShowUserModal(true);
    }
  }, []);

  useEffect(() => {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
    void loadUsers();
    const unsub = subscribeToCloudSync(() => {
      void refreshAll();
      setSyncStatus('synced');
    });
    const onOnline = () => void runCloudSync(true);
    window.addEventListener('online', onOnline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
    };
  }, [refreshAll, runCloudSync, loadUsers]);

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

  const handleCreateProject = async (
    name: string,
    description = '',
    ownerName = activeUser?.nombre || ''
  ) => {
    const now = Date.now();
    const created = await saveProject({
      id: createId('proj'),
      name,
      description: description || undefined,
      ownerName: ownerName || undefined,
      createdAt: now,
      updatedAt: now
    });
    await refreshAll();
    showToast(`Proyecto "${created.name}" creado`);
    return created;
  };

  const handleUpdateProject = async (project: Project) => {
    await saveProject(project);
    await refreshAll();
    showToast('Proyecto actualizado');
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

  const handleGenerateShareLink = async (projectId: string): Promise<string | null> => {
    try {
      const payload = await buildProjectSharePayload(projectId);
      if (!payload) {
        showToast('No se encontró el proyecto');
        return null;
      }
      return await encodeProjectShareUrl(payload, window.location.href);
    } catch {
      showToast('No se pudo generar el enlace');
      return null;
    }
  };

  const handleDownloadProjectJson = async (projectId: string) => {
    const payload = await buildProjectSharePayload(projectId);
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.project.name.toLowerCase().replace(/\s+/g, '-')}-guiones.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Respaldo .json descargado');
  };

  const handleImportProjectJson = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as SharedProjectPayload;
      if (!payload || payload.v !== 1 || !payload.project) {
        showToast('Archivo .json no válido');
        return;
      }
      const imported = await importSharedProjectPayload(payload);
      await refreshAll();
      setView({ name: 'project', projectId: imported.id });
      showToast(`Proyecto "${imported.name}" cargado`);
    } catch {
      showToast('No se pudo leer el archivo .json');
    }
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
    if (teleprompterState.customBlocks && teleprompterState.customTitle) {
      return (
        <TeleprompterPage
          documentTitle={teleprompterState.customTitle}
          blocks={teleprompterState.customBlocks}
          onExit={() => setTeleprompterState(null)}
        />
      );
    }
    const doc = allDocs.find((d) => d.id === teleprompterState.docId);
    if (doc) {
      const selectedBlocks = selectBlocksForTeleprompter(
        doc.blocks,
        teleprompterState.selectedIds || []
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
  } else if (view.name === 'ideas') {
    headerTitle = 'Banco de Ideas';
    headerSubtitle = 'Votos, viralidad y guiones';
  } else if (view.name === 'hooks') {
    headerTitle = 'Ganchos y CTA';
    headerSubtitle = '49 tipos, banco y palabras clave';
  } else if (view.name === 'settings') {
    headerTitle = 'Ajustes y Equipo';
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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ minHeight: 36, padding: '4px 10px', fontSize: '0.78rem' }}
          onClick={() => setShowUserModal(true)}
          title="Cambiar o crear usuario"
        >
          <User size={14} color="#38bdf8" />
          <span style={{ maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeUser ? activeUser.nombre : 'Usuario'}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ minHeight: 36, padding: '4px 10px', fontSize: '0.78rem' }}
          onClick={() => void runCloudSync(false)}
          title="Sincronizar con Supabase"
        >
          {syncStatus === 'syncing' ? (
            <RefreshCw size={14} />
          ) : syncStatus === 'offline' ? (
            <CloudOff size={14} color="#94a3b8" />
          ) : (
            <Cloud size={14} color={syncStatus === 'error' ? '#fbbf24' : '#34d399'} />
          )}
          <span>
            {syncStatus === 'syncing'
              ? 'Sincronizando'
              : syncStatus === 'offline'
              ? 'Local'
              : syncStatus === 'error'
              ? 'Pendiente SQL'
              : 'Nube'}
          </span>
        </button>
      </header>

      <main style={{ flex: 1 }}>
        {view.name === 'home' && (
          <HomePage
            projects={projects}
            recentPieces={pieces}
            onGoProjects={() => setView({ name: 'projects' })}
            onGoImport={() => setView({ name: 'import', mode: 'pick' })}
            onGoPasteText={() => setView({ name: 'import', mode: 'paste' })}
            onGoIdeas={() => setView({ name: 'ideas' })}
            onGoHooks={() => setView({ name: 'hooks' })}
            onOpenPiece={(pieceId) => void handleOpenPiece(pieceId)}
          />
        )}

        {view.name === 'ideas' && (
          <IdeasPage
            activeUser={activeUser}
            schemaMissing={schemaMissing}
            onOpenStoryboard={(g) => setStoryboardGuion(g)}
            onNotify={showToast}
          />
        )}

        {view.name === 'hooks' && (
          <HooksCtaPage
            activeUser={activeUser}
            schemaMissing={schemaMissing}
            onNotify={showToast}
          />
        )}

        {view.name === 'settings' && (
          <ReelLabSettingsPage
            users={users}
            activeUser={activeUser}
            schemaMissing={schemaMissing}
            onSelectUser={(u) => {
              setActiveUser(u);
              setStoredActiveUser(u);
              showToast(`Usuario activo: ${u.nombre}`);
            }}
            onCreateUser={async (name) => {
              const created = await createVotante(name);
              if (created) {
                setActiveUser(created);
                setStoredActiveUser(created);
                await loadUsers();
              }
            }}
            onRefreshUsers={loadUsers}
            onNotify={showToast}
          />
        )}

        {view.name === 'projects' && (
          <ProjectsPage
            projects={projects}
            pieceCounts={pieceCounts}
            activeUserName={activeUser?.nombre}
            onCreateProject={async (name, desc, owner) => {
              await handleCreateProject(name, desc, owner);
            }}
            onOpenProject={(projectId) => setView({ name: 'project', projectId })}
            onDeleteProject={handleDeleteProject}
            onImportProjectJson={handleImportProjectJson}
          />
        )}

        {view.name === 'project' && activeProject && (
          <ProjectDetailPage
            project={activeProject}
            pieces={pieces.filter((p) => p.projectId === activeProject.id)}
            docCounts={docCounts}
            activeUserName={activeUser?.nombre}
            onUpdateProject={handleUpdateProject}
            onCreatePiece={async (title, refUrl) => {
              await handleCreatePiece(activeProject.id, title, refUrl);
            }}
            onOpenPiece={(pieceId) => void handleOpenPiece(pieceId)}
            onDeletePiece={handleDeletePiece}
            onGenerateShareLink={handleGenerateShareLink}
            onDownloadProjectJson={handleDownloadProjectJson}
            onNotify={showToast}
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
            onSaveImportedBatch={async (projectId, batchPieces: ParsedBatchPiece[]) => {
              const now = Date.now();
              for (let i = 0; i < batchPieces.length; i++) {
                const item = batchPieces[i];
                const piece = await savePiece({
                  id: createId('piece'),
                  projectId,
                  title: item.pieceTitle,
                  referenceUrl: item.referenceUrl,
                  createdAt: now + i,
                  updatedAt: now + i
                });
                await saveDocument({
                  id: createId('doc'),
                  pieceId: piece.id,
                  title: item.docTitle || 'Guion final',
                  type: item.docType,
                  blocks: item.blocks,
                  createdAt: now + i,
                  updatedAt: now + i
                });
              }
              await refreshAll();
              setView({ name: 'project', projectId });
              showToast(`${batchPieces.length} piezas guardadas en el proyecto`);
            }}
          />
        )}
      </main>

      {storyboardGuion && (
        <StoryboardPrintModal
          guion={storyboardGuion}
          onClose={() => setStoryboardGuion(null)}
          onOpenTeleprompter={(title, blocks) => {
            setTeleprompterState({ customTitle: title, customBlocks: blocks });
          }}
          onNotify={showToast}
          onUpdated={async () => {}}
        />
      )}

      {showUserModal && (
        <UserSelectorModal
          users={users}
          activeUser={activeUser}
          schemaMissing={schemaMissing}
          canClose={Boolean(activeUser) || schemaMissing || users.length === 0}
          onSelectUser={(u) => {
            setActiveUser(u);
            setStoredActiveUser(u);
            setShowUserModal(false);
            showToast(`Hola, ${u.nombre}`);
          }}
          onCreateUser={async (name) => {
            const created = await createVotante(name);
            if (created) {
              setActiveUser(created);
              setStoredActiveUser(created);
              await loadUsers();
              setShowUserModal(false);
              showToast(`Usuario "${created.nombre}" creado`);
            }
          }}
          onClose={() => setShowUserModal(false)}
        />
      )}

      {toast && <div className="toast-banner">{toast}</div>}

      <nav className="bottom-nav" aria-label="Navegación principal">
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={`nav-item ${view.name === 'home' ? 'active' : ''}`}
            onClick={() => setView({ name: 'home' })}
          >
            <Home size={20} />
            <span>Inicio</span>
          </button>
          <button
            type="button"
            className={`nav-item ${view.name === 'ideas' ? 'active' : ''}`}
            onClick={() => setView({ name: 'ideas' })}
          >
            <Lightbulb size={20} />
            <span>Ideas</span>
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
            <FolderKanban size={20} />
            <span>Proyectos</span>
          </button>
          <button
            type="button"
            className={`nav-item ${view.name === 'hooks' ? 'active' : ''}`}
            onClick={() => setView({ name: 'hooks' })}
          >
            <Wand2 size={20} />
            <span>Ganchos</span>
          </button>
          <button
            type="button"
            className={`nav-item ${view.name === 'settings' ? 'active' : ''}`}
            onClick={() => setView({ name: 'settings' })}
          >
            <Settings size={20} />
            <span>Ajustes</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
