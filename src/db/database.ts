import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ContentPiece, Project, ScriptDocument } from '../types/models';
import { pushEntityToCloud, pushProjectDeleteCascade } from './cloudSync';

const IS_TEST = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

interface GuionDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': number };
  };
  pieces: {
    key: string;
    value: ContentPiece;
    indexes: { 'by-project': string; 'by-updated': number };
  };
  documents: {
    key: string;
    value: ScriptDocument;
    indexes: { 'by-piece': string; 'by-updated': number };
  };
}

const DB_NAME = 'guion-en-pantalla-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GuionDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GuionDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GuionDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('pieces')) {
          const pieceStore = db.createObjectStore('pieces', { keyPath: 'id' });
          pieceStore.createIndex('by-project', 'projectId');
          pieceStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('by-piece', 'pieceId');
          docStore.createIndex('by-updated', 'updatedAt');
        }
      }
    });
  }
  return dbPromise;
}

export function resetDBConnection(): void {
  dbPromise = null;
}

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Projects
export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  const list = await db.getAll('projects');
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function saveProject(project: Project): Promise<Project> {
  const db = await getDB();
  await db.put('projects', project);
  if (!IS_TEST) void pushEntityToCloud('project', project.id, project, project.updatedAt);
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDB();
  const pieces = await db.getAllFromIndex('pieces', 'by-project', projectId);
  const docIds: string[] = [];
  for (const piece of pieces) {
    const docs = await db.getAllFromIndex('documents', 'by-piece', piece.id);
    docIds.push(...docs.map((d) => d.id));
    await deletePiece(piece.id);
  }
  await db.delete('projects', projectId);
  if (!IS_TEST) {
    void pushProjectDeleteCascade(
      projectId,
      pieces.map((p) => p.id),
      docIds
    );
  }
}

// Content Pieces
export async function getAllPieces(): Promise<ContentPiece[]> {
  const db = await getDB();
  const list = await db.getAll('pieces');
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPiecesByProject(projectId: string): Promise<ContentPiece[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('pieces', 'by-project', projectId);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPiece(id: string): Promise<ContentPiece | undefined> {
  const db = await getDB();
  return db.get('pieces', id);
}

export async function savePiece(piece: ContentPiece): Promise<ContentPiece> {
  const db = await getDB();
  await db.put('pieces', piece);
  if (!IS_TEST) void pushEntityToCloud('piece', piece.id, piece, piece.updatedAt);
  const project = await db.get('projects', piece.projectId);
  if (project) {
    const updatedProj = { ...project, updatedAt: Date.now() };
    await db.put('projects', updatedProj);
    if (!IS_TEST) void pushEntityToCloud('project', updatedProj.id, updatedProj, updatedProj.updatedAt);
  }
  return piece;
}

export async function deletePiece(pieceId: string): Promise<void> {
  const db = await getDB();
  const docs = await db.getAllFromIndex('documents', 'by-piece', pieceId);
  const tx = db.transaction(['documents', 'pieces'], 'readwrite');
  for (const doc of docs) {
    await tx.objectStore('documents').delete(doc.id);
  }
  await tx.objectStore('pieces').delete(pieceId);
  await tx.done;

  if (!IS_TEST) {
    const now = Date.now();
    void pushEntityToCloud(
      'piece',
      pieceId,
      { id: pieceId, projectId: '', title: '', createdAt: now, updatedAt: now },
      now,
      true
    );
    for (const doc of docs) {
      void pushEntityToCloud('document', doc.id, doc, now, true);
    }
  }
}

// Documents
export async function getDocumentsByPiece(pieceId: string): Promise<ScriptDocument[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('documents', 'by-piece', pieceId);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<ScriptDocument | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function saveDocument(doc: ScriptDocument): Promise<ScriptDocument> {
  const db = await getDB();
  await db.put('documents', doc);
  if (!IS_TEST) void pushEntityToCloud('document', doc.id, doc, doc.updatedAt);
  const piece = await db.get('pieces', doc.pieceId);
  if (piece) {
    const updatedPiece = { ...piece, updatedAt: Date.now() };
    await db.put('pieces', updatedPiece);
    if (!IS_TEST) void pushEntityToCloud('piece', updatedPiece.id, updatedPiece, updatedPiece.updatedAt);
    const project = await db.get('projects', piece.projectId);
    if (project) {
      const updatedProj = { ...project, updatedAt: Date.now() };
      await db.put('projects', updatedProj);
      if (!IS_TEST) void pushEntityToCloud('project', updatedProj.id, updatedProj, updatedProj.updatedAt);
    }
  }
  return doc;
}

export async function deleteDocument(docId: string): Promise<void> {
  const db = await getDB();
  await db.delete('documents', docId);
  if (!IS_TEST) {
    const now = Date.now();
    void pushEntityToCloud(
      'document',
      docId,
      { id: docId, pieceId: '', title: '', type: 'Guion', blocks: [], createdAt: now, updatedAt: now },
      now,
      true
    );
  }
}
