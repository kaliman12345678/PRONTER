import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getDB } from './database';
import type { ContentPiece, Project, ScriptDocument } from '../types/models';

export const DEFAULT_SUPABASE_URL = 'https://avyqqucietflvelskwes.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ETKnXVL1x43FFvSVhu0g-Q_dxJIAZsU';
export const DEFAULT_SPACE_KEY = 'noxa-principal';

const SPACE_KEY_STORAGE = 'guion-en-pantalla-space-key-v1';

export type EntityType = 'project' | 'piece' | 'document' | 'ai_config';

export interface SyncedAIConfigData {
  provider: 'gemini' | 'claude-direct';
  geminiModel: string;
  claudeModel: string;
  trendsSource: 'auto' | 'trends-rss' | 'tavily' | 'gemini-search' | 'off';
  trendsGeo: string;
  marketRegion: string;
  expertPersona: string;
  brandContext: string;
  updatedAt: number;
  updatedBy?: string;
}

export interface CloudSyncRow {
  space_key: string;
  entity_type: EntityType;
  entity_id: string;
  data: Project | Omit<ContentPiece, 'videoBlob'> | ScriptDocument | SyncedAIConfigData | Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
}

interface AIConfigSyncAdapter {
  getLocalUpdatedAt: () => number;
  getSyncPayload: () => SyncedAIConfigData;
  applyRemote: (data: SyncedAIConfigData) => boolean;
}

let aiSyncAdapter: AIConfigSyncAdapter | null = null;

export function registerAIConfigSyncAdapter(adapter: AIConfigSyncAdapter): void {
  aiSyncAdapter = adapter;
}

export async function pushAIConfigToCloud(
  payload: SyncedAIConfigData
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }
  const { error } = await client.from('guion_sync').upsert(
    {
      space_key: getSpaceKey(),
      entity_type: 'ai_config',
      entity_id: 'global',
      data: payload,
      updated_at: payload.updatedAt,
      deleted: false
    },
    { onConflict: 'space_key,entity_type,entity_id' }
  );
  return !error;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!supabaseClient) {
    supabaseClient = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseClient;
}

export function getSpaceKey(): string {
  try {
    return localStorage.getItem(SPACE_KEY_STORAGE) || DEFAULT_SPACE_KEY;
  } catch {
    return DEFAULT_SPACE_KEY;
  }
}

export function setSpaceKey(key: string): void {
  try {
    const clean = key.trim() || DEFAULT_SPACE_KEY;
    localStorage.setItem(SPACE_KEY_STORAGE, clean);
  } catch {
    // ignore
  }
}

function stripBlobFromPiece(piece: ContentPiece): Omit<ContentPiece, 'videoBlob'> {
  const { videoBlob: _blob, ...rest } = piece;
  return rest;
}

export async function pushEntityToCloud(
  entityType: EntityType,
  entityId: string,
  data: Project | ContentPiece | ScriptDocument,
  updatedAt: number,
  deleted = false
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return false;
  }

  const payloadData =
    entityType === 'piece' ? stripBlobFromPiece(data as ContentPiece) : data;

  const { error } = await client.from('guion_sync').upsert(
    {
      space_key: getSpaceKey(),
      entity_type: entityType,
      entity_id: entityId,
      data: payloadData,
      updated_at: updatedAt,
      deleted
    },
    { onConflict: 'space_key,entity_type,entity_id' }
  );

  return !error;
}

export async function pushProjectDeleteCascade(
  projectId: string,
  pieceIds: string[],
  docIds: string[]
): Promise<void> {
  const now = Date.now();
  const dummyProj = { id: projectId, name: '', createdAt: now, updatedAt: now };
  await pushEntityToCloud('project', projectId, dummyProj, now, true);
  for (const pid of pieceIds) {
    await pushEntityToCloud(
      'piece',
      pid,
      { id: pid, projectId, title: '', createdAt: now, updatedAt: now },
      now,
      true
    );
  }
  for (const did of docIds) {
    await pushEntityToCloud(
      'document',
      did,
      { id: did, pieceId: '', title: '', type: 'Guion', blocks: [], createdAt: now, updatedAt: now },
      now,
      true
    );
  }
}

async function applyRemoteRow(row: CloudSyncRow): Promise<boolean> {
  if (row.entity_type === 'ai_config') {
    if (row.entity_id !== 'global' || row.deleted || !aiSyncAdapter) {
      return false;
    }
    const remote = row.data as SyncedAIConfigData;
    const remoteTs = row.updated_at || remote.updatedAt || 0;
    const localTs = aiSyncAdapter.getLocalUpdatedAt();
    if (remoteTs > localTs) {
      return aiSyncAdapter.applyRemote({ ...remote, updatedAt: remoteTs });
    }
    return false;
  }

  const db = await getDB();
  const storeName =
    row.entity_type === 'project'
      ? 'projects'
      : row.entity_type === 'piece'
      ? 'pieces'
      : 'documents';

  const local = await db.get(storeName, row.entity_id);

  if (row.deleted) {
    if (local && local.updatedAt <= row.updated_at) {
      await db.delete(storeName, row.entity_id);
      return true;
    }
    return false;
  }

  if (!local || row.updated_at > local.updatedAt) {
    if (row.entity_type === 'piece') {
      const localPiece = local as ContentPiece | undefined;
      const remotePiece = row.data as Omit<ContentPiece, 'videoBlob'>;
      await db.put('pieces', {
        ...remotePiece,
        videoBlob: localPiece?.videoBlob,
        videoFileName: localPiece?.videoFileName,
        videoMimeType: localPiece?.videoMimeType
      });
    } else if (row.entity_type === 'project') {
      await db.put('projects', row.data as Project);
    } else {
      await db.put('documents', row.data as ScriptDocument);
    }
    return true;
  }

  return false;
}

export async function syncAllWithCloud(): Promise<{
  status: SyncStatus;
  changed: boolean;
  errorMessage?: string;
}> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { status: 'offline', changed: false };
  }

  const spaceKey = getSpaceKey();
  const { data: remoteRows, error } = await client
    .from('guion_sync')
    .select('*')
    .eq('space_key', spaceKey);

  if (error) {
    return {
      status: 'error',
      changed: false,
      errorMessage: error.message
    };
  }

  const rows = (remoteRows || []) as CloudSyncRow[];
  const remoteMap = new Map<string, CloudSyncRow>();
  let changed = false;

  for (const row of rows) {
    remoteMap.set(`${row.entity_type}:${row.entity_id}`, row);
    const applied = await applyRemoteRow(row);
    if (applied) changed = true;
  }

  // Push any local items that are newer or missing in cloud
  const db = await getDB();
  const [projects, pieces, documents] = await Promise.all([
    db.getAll('projects'),
    db.getAll('pieces'),
    db.getAll('documents')
  ]);

  const toPush: CloudSyncRow[] = [];

  for (const p of projects) {
    const remote = remoteMap.get(`project:${p.id}`);
    if (!remote || (!remote.deleted && p.updatedAt > remote.updated_at)) {
      toPush.push({
        space_key: spaceKey,
        entity_type: 'project',
        entity_id: p.id,
        data: p,
        updated_at: p.updatedAt,
        deleted: false
      });
    }
  }

  for (const pc of pieces) {
    const remote = remoteMap.get(`piece:${pc.id}`);
    if (!remote || (!remote.deleted && pc.updatedAt > remote.updated_at)) {
      toPush.push({
        space_key: spaceKey,
        entity_type: 'piece',
        entity_id: pc.id,
        data: stripBlobFromPiece(pc),
        updated_at: pc.updatedAt,
        deleted: false
      });
    }
  }

  for (const d of documents) {
    const remote = remoteMap.get(`document:${d.id}`);
    if (!remote || (!remote.deleted && d.updatedAt > remote.updated_at)) {
      toPush.push({
        space_key: spaceKey,
        entity_type: 'document',
        entity_id: d.id,
        data: d,
        updated_at: d.updatedAt,
        deleted: false
      });
    }
  }

  const remoteAIConfig = remoteMap.get('ai_config:global');
  if (aiSyncAdapter) {
    const localTs = aiSyncAdapter.getLocalUpdatedAt();
    if (localTs > 0 && (!remoteAIConfig || localTs > remoteAIConfig.updated_at)) {
      const payload = aiSyncAdapter.getSyncPayload();
      toPush.push({
        space_key: spaceKey,
        entity_type: 'ai_config',
        entity_id: 'global',
        data: payload,
        updated_at: payload.updatedAt,
        deleted: false
      });
    }
  }

  if (toPush.length > 0) {
    await client
      .from('guion_sync')
      .upsert(toPush, { onConflict: 'space_key,entity_type,entity_id' });
  }

  return { status: 'synced', changed };
}

export function subscribeToCloudSync(onChange: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const spaceKey = getSpaceKey();
  const channel: RealtimeChannel = client
    .channel(`guion-sync-${spaceKey}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'guion_sync',
        filter: `space_key=eq.${spaceKey}`
      },
      async (payload) => {
        const row = (payload.new || payload.old) as CloudSyncRow | undefined;
        if (!row || !row.entity_type || !row.entity_id) return;
        const applied = await applyRemoteRow(row);
        if (applied) onChange();
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
