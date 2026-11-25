import { getDB, saveDocument, savePiece, saveProject } from '../db/database';
import type { ContentPiece, Project, ScriptDocument } from '../types/models';

export interface SharedProjectPayload {
  v: 1;
  project: Project;
  pieces: Omit<ContentPiece, 'videoBlob'>[];
  documents: ScriptDocument[];
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compressString(input: string): Promise<{ compressed: boolean; data: string }> {
  const utf8 = new TextEncoder().encode(input);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      await writer.write(utf8);
      await writer.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return { compressed: true, data: toBase64Url(new Uint8Array(buf)) };
    } catch {
      // Fallback to uncompressed base64url
    }
  }
  return { compressed: false, data: toBase64Url(utf8) };
}

async function decompressString(data: string, compressed: boolean): Promise<string> {
  const bytes = fromBase64Url(data);
  if (compressed && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    await writer.write(new Uint8Array(bytes));
    await writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(buf);
  }
  return new TextDecoder().decode(bytes);
}

export async function buildProjectSharePayload(projectId: string): Promise<SharedProjectPayload | null> {
  const db = await getDB();
  const project = await db.get('projects', projectId);
  if (!project) return null;

  const pieces = await db.getAllFromIndex('pieces', 'by-project', projectId);
  const documents: ScriptDocument[] = [];
  for (const piece of pieces) {
    const docs = await db.getAllFromIndex('documents', 'by-piece', piece.id);
    documents.push(...docs);
  }

  return {
    v: 1,
    project,
    pieces: pieces.map(({ videoBlob: _blob, ...rest }) => rest),
    documents
  };
}

export async function encodeProjectShareUrl(
  payload: SharedProjectPayload,
  currentHref: string
): Promise<string> {
  const json = JSON.stringify(payload);
  const { compressed, data } = await compressString(json);
  const prefix = compressed ? 'gz:' : 'raw:';
  const baseUrl = currentHref.split('#')[0];
  return `${baseUrl}#share=${prefix}${data}`;
}

export async function decodeProjectShareHash(
  hash: string
): Promise<SharedProjectPayload | null> {
  if (!hash.startsWith('#share=')) return null;
  const raw = hash.slice('#share='.length);
  const compressed = raw.startsWith('gz:');
  const data = raw.replace(/^(gz:|raw:)/, '');
  const json = await decompressString(data, compressed);
  const parsed = JSON.parse(json) as SharedProjectPayload;
  if (!parsed || parsed.v !== 1 || !parsed.project || !Array.isArray(parsed.pieces)) {
    return null;
  }
  return parsed;
}

export async function importSharedProjectPayload(
  payload: SharedProjectPayload
): Promise<Project> {
  await saveProject(payload.project);
  for (const piece of payload.pieces) {
    await savePiece({ ...piece });
  }
  for (const doc of payload.documents) {
    await saveDocument(doc);
  }
  return payload.project;
}
