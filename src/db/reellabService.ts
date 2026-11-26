import { createId, getDB } from './database';
import { getSupabaseClient } from './cloudSync';
import type { ScriptBlock } from '../types/models';
import type {
  BloqueStoryboard,
  CatalogoItem,
  CatalogoTipo,
  GanchoTipo,
  GuionEstado,
  GuionResumen,
  IdeaConPuntaje,
  Lote,
  PalabraClave,
  PesoViralidad,
  PiezaResumen,
  Votante
} from '../types/reellab';

const ACTIVE_USER_KEY = 'guion-en-pantalla-active-user-v1';

export function getStoredActiveUser(): Votante | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? (JSON.parse(raw) as Votante) : null;
  } catch {
    return null;
  }
}

export function setStoredActiveUser(user: Votante | null): void {
  try {
    if (!user) localStorage.removeItem(ACTIVE_USER_KEY);
    else localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export async function fetchVotantes(): Promise<{ users: Votante[]; schemaMissing: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { users: [], schemaMissing: false };
  const { data, error } = await client
    .from('votante')
    .select('*')
    .order('orden', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    const msg = error.message.toLowerCase();
    const schemaMissing =
      msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42P01';
    return { users: [], schemaMissing };
  }
  return { users: (data || []) as Votante[], schemaMissing: false };
}

export async function createVotante(nombre: string): Promise<Votante | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const clean = nombre.trim();
  if (!clean) return null;

  const { data: existing } = await client
    .from('votante')
    .select('*')
    .ilike('nombre', clean)
    .maybeSingle();
  if (existing) return existing as Votante;

  const { data, error } = await client
    .from('votante')
    .insert({ nombre: clean, activo: true, orden: 10 })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Votante;
}

export async function toggleVotanteActivo(id: number, activo: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('votante').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchCatalogos(): Promise<CatalogoItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('catalogo')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true })
    .order('id', { ascending: true });
  return (data || []) as CatalogoItem[];
}

export async function addCatalogoItem(tipo: CatalogoTipo, valor: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('catalogo')
    .insert({ tipo, valor: valor.trim(), activo: true, orden: 50 });
  if (error) throw new Error(error.message);
}

export async function deleteCatalogoItem(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('catalogo').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchPesosViralidad(): Promise<PesoViralidad[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client.from('peso_viralidad').select('*').order('clave');
  return (data || []) as PesoViralidad[];
}

export async function updatePesoViralidad(clave: string, peso: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('peso_viralidad').update({ peso }).eq('clave', clave);
  if (error) throw new Error(error.message);
}

export async function fetchLotes(): Promise<Lote[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('lote')
    .select('*')
    .order('numero', { ascending: false });
  return (data || []) as Lote[];
}

export async function createLote(nombre?: string): Promise<Lote> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const lotes = await fetchLotes();
  const nextNum = lotes.length > 0 ? Math.max(...lotes.map((l) => l.numero)) + 1 : 1;
  const today = new Date().toLocaleDateString('es-CO');
  const finalName = nombre?.trim() || `LOTE ${nextNum} · ${today}`;
  const { data, error } = await client
    .from('lote')
    .insert({ numero: nextNum, nombre: finalName })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Lote;
}

export async function fetchIdeas(): Promise<IdeaConPuntaje[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('idea_con_puntaje')
    .select('*')
    .order('id', { ascending: false });
  return (data || []) as IdeaConPuntaje[];
}

export async function fetchVotosDeUsuario(votanteId: number): Promise<Record<number, number>> {
  const client = getSupabaseClient();
  if (!client) return {};
  const { data } = await client
    .from('voto')
    .select('idea_id, puntaje')
    .eq('votante_id', votanteId);
  const map: Record<number, number> = {};
  for (const row of data || []) {
    map[row.idea_id as number] = row.puntaje as number;
  }
  return map;
}

export async function saveIdeaVoto(
  ideaId: number,
  votanteId: number,
  puntaje: number
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('voto')
    .upsert({ idea_id: ideaId, votante_id: votanteId, puntaje }, { onConflict: 'idea_id,votante_id' });
  if (error) throw new Error(error.message);
}

export async function createIdea(input: {
  titulo: string;
  texto_base?: string;
  pilar?: string;
  tematica?: string;
  formato?: string;
  referencia_url?: string;
  lote_id?: number | null;
  nivel_conciencia?: number | null;
}): Promise<IdeaConPuntaje> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const { data: inserted, error } = await client
    .from('idea')
    .insert({
      titulo: input.titulo.trim(),
      texto_base: input.texto_base?.trim() || null,
      pilar: input.pilar || null,
      tematica: input.tematica || null,
      formato: input.formato || null,
      referencia_url: input.referencia_url?.trim() || null,
      lote_id: input.lote_id ?? null,
      nivel_conciencia: input.nivel_conciencia ?? null,
      origen: input.referencia_url ? 'referencia' : 'manual'
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const { data: full } = await client
    .from('idea_con_puntaje')
    .select('*')
    .eq('id', inserted.id)
    .single();
  return full as IdeaConPuntaje;
}

export async function updateIdea(
  id: number,
  patch: Partial<{
    titulo: string;
    texto_base: string | null;
    pilar: string | null;
    tematica: string | null;
    formato: string | null;
    referencia_url: string | null;
    estado: string;
    nino_5: boolean;
    gusta_50: boolean;
    ref_viral: boolean;
    mercado_viral: boolean;
    tendencia: boolean;
    controversia: boolean;
    calificada: boolean;
    nivel_conciencia: number | null;
  }>
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('idea').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteIdea(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('idea').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchGuiones(): Promise<GuionResumen[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('guion_resumen')
    .select('*')
    .order('id', { ascending: false });
  return (data || []) as GuionResumen[];
}

export async function fetchBloquesByGuion(guionId: number): Promise<BloqueStoryboard[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('bloque')
    .select('*')
    .eq('guion_id', guionId)
    .order('orden', { ascending: true });
  return (data || []) as BloqueStoryboard[];
}

export async function createGuionFromIdea(idea: IdeaConPuntaje): Promise<GuionResumen> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');

  // Return existing guion if already linked
  if (idea.guion_id) {
    const { data: existing } = await client
      .from('guion_resumen')
      .select('*')
      .eq('id', idea.guion_id)
      .maybeSingle();
    if (existing) return existing as GuionResumen;
  }

  const { data: created, error } = await client
    .from('guion')
    .insert({
      idea_id: idea.id,
      parte: 1,
      titulo: idea.titulo,
      estado: 'pendiente'
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  // Seed default 4 storyboard scenes
  const baseText = idea.texto_base?.trim() || '';
  await client.from('bloque').insert([
    {
      guion_id: created.id,
      orden: 1,
      tipo: 'gancho',
      inicio_s: 0,
      fin_s: 4,
      dialogo: baseText ? baseText.split('\n')[0] || '' : '',
      texto_pantalla: ''
    },
    {
      guion_id: created.id,
      orden: 2,
      tipo: 'historia',
      inicio_s: 4,
      fin_s: 28,
      dialogo: baseText ? baseText.split('\n').slice(1).join(' ') : '',
      texto_pantalla: ''
    },
    {
      guion_id: created.id,
      orden: 3,
      tipo: 'moraleja',
      inicio_s: 28,
      fin_s: 42,
      dialogo: '',
      texto_pantalla: ''
    },
    {
      guion_id: created.id,
      orden: 4,
      tipo: 'cta',
      inicio_s: 42,
      fin_s: 50,
      dialogo: '',
      texto_pantalla: ''
    }
  ]);

  await updateIdea(idea.id, { estado: 'en_guion' });

  const { data: full } = await client
    .from('guion_resumen')
    .select('*')
    .eq('id', created.id)
    .single();
  return full as GuionResumen;
}

export async function updateGuionEstado(guionId: number, estado: GuionEstado): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('guion').update({ estado }).eq('id', guionId);
  if (error) throw new Error(error.message);
}

export async function saveBloque(bloque: BloqueStoryboard): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { id, ...rest } = bloque;
  const { error } = await client.from('bloque').update(rest).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addBloqueToGuion(
  guionId: number,
  orden: number,
  tipo: BloqueStoryboard['tipo'] = 'historia'
): Promise<BloqueStoryboard> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const { data, error } = await client
    .from('bloque')
    .insert({
      guion_id: guionId,
      orden,
      tipo,
      dialogo: '',
      texto_pantalla: ''
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as BloqueStoryboard;
}

export async function deleteBloque(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('bloque').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadSketchImage(guionId: number, file: File): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const ext = file.name.split('.').pop() || 'png';
  const filePath = `guion-${guionId}/${Date.now()}.${ext}`;
  const { error } = await client.storage.from('sketches').upload(filePath, file, {
    upsert: true
  });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from('sketches').getPublicUrl(filePath);
  return data.publicUrl;
}

// Ganchos & CTA
export async function fetchGanchoTipos(): Promise<GanchoTipo[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('gancho_tipo')
    .select('*')
    .order('familia')
    .order('numero');
  return (data || []) as GanchoTipo[];
}

export async function fetchPiezasGanchoCta(): Promise<PiezaResumen[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('pieza_resumen')
    .select('*')
    .order('id', { ascending: false });
  return (data || []) as PiezaResumen[];
}

export async function createPiezaGanchoCta(input: {
  clase: 'gancho' | 'cta';
  texto: string;
  visual?: string;
  gancho_tipo_id?: number | null;
  objetivo?: string;
  nota?: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('pieza').insert({
    clase: input.clase,
    texto: input.texto.trim(),
    visual: input.visual?.trim() || null,
    gancho_tipo_id: input.gancho_tipo_id ?? null,
    objetivo: input.objetivo || null,
    nota: input.nota?.trim() || null
  });
  if (error) throw new Error(error.message);
}

export async function savePiezaVoto(
  piezaId: number,
  votanteId: number,
  puntaje: number
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('voto_pieza')
    .upsert({ pieza_id: piezaId, votante_id: votanteId, puntaje }, { onConflict: 'pieza_id,votante_id' });
  if (error) throw new Error(error.message);
}

export async function fetchPalabrasClave(): Promise<PalabraClave[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client
    .from('palabra_clave')
    .select('*')
    .order('palabra');
  return (data || []) as PalabraClave[];
}

export async function createPalabraClave(input: {
  palabra: string;
  recurso?: string;
  variantes?: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const clean = input.palabra.trim().toUpperCase();
  const { error } = await client.from('palabra_clave').insert({
    palabra: clean,
    recurso: input.recurso?.trim() || null,
    variantes: input.variantes?.trim() || null
  });
  if (error) throw new Error(error.message);
}

/**
 * Converts ReelLab storyboard scenes into PRONTER Teleprompter ScriptBlock[].
 */
export function convertBloquesToTeleprompter(bloques: BloqueStoryboard[]): ScriptBlock[] {
  return bloques
    .filter((b) => b.dialogo.trim() !== '' || b.texto_pantalla.trim() !== '')
    .map((b) => {
      const timeLabel =
        b.inicio_s != null && b.fin_s != null ? `${b.inicio_s}–${b.fin_s} s · ` : '';
      const typeLabel =
        b.tipo === 'gancho'
          ? 'Gancho'
          : b.tipo === 'historia'
          ? 'Historia'
          : b.tipo === 'moraleja'
          ? 'Moraleja'
          : b.tipo === 'moraleja_cta'
          ? 'Moraleja + CTA'
          : 'CTA';
      const cuesParts = [
        b.plano ? `Plano: ${b.plano}` : '',
        b.camara ? `Cámara: ${b.camara}` : '',
        b.texto_pantalla ? `En pantalla: ${b.texto_pantalla}` : '',
        b.sketch_texto ? `Nota: ${b.sketch_texto}` : ''
      ].filter(Boolean);

      return {
        id: `rl-blk-${b.id}`,
        title: `${timeLabel}${typeLabel}`,
        text: b.dialogo.trim() || b.texto_pantalla.trim(),
        cues: cuesParts.length > 0 ? cuesParts.join(' · ') : undefined
      };
    });
}

export function estimateWordStats(bloques: BloqueStoryboard[]): {
  words: number;
  seconds: number;
} {
  const words = bloques.reduce((acc, b) => {
    const trimmed = b.dialogo.trim();
    if (!trimmed) return acc;
    return acc + trimmed.split(/\s+/).length;
  }, 0);
  return { words, seconds: Math.round(words / 3) };
}

export async function saveIdeaAsPronterPiece(
  projectId: string,
  guion: GuionResumen,
  bloques: BloqueStoryboard[]
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  const pieceId = createId('piece');
  await db.put('pieces', {
    id: pieceId,
    projectId,
    title: guion.titulo,
    createdAt: now,
    updatedAt: now
  });
  await db.put('documents', {
    id: createId('doc'),
    pieceId,
    title: 'Guion ReelLab',
    type: 'Guion',
    blocks: convertBloquesToTeleprompter(bloques),
    createdAt: now,
    updatedAt: now
  });
  return pieceId;
}
