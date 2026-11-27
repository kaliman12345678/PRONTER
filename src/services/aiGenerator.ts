import {
  getSpaceKey,
  getSupabaseClient,
  pushAIConfigToCloud,
  registerAIConfigSyncAdapter,
  type SyncedAIConfigData
} from '../db/cloudSync';
import type { BloqueStoryboard, GanchoTipo } from '../types/reellab';

export type AIProvider = 'gemini' | 'claude-edge' | 'claude-direct';
export type TrendsSource = 'auto' | 'trends-rss' | 'tavily' | 'gemini-search' | 'off';

export interface AIConfig {
  provider: AIProvider;
  geminiApiKey: string;
  geminiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  trendsSource: TrendsSource;
  trendsGeo: string;
  tavilyApiKey: string;
  useTrendsSearch: boolean;
  marketRegion: string;
  expertPersona: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface VaultKeyState {
  configured: boolean;
  hint: string;
}

export interface TeamVaultStatus {
  deployed: boolean;
  gemini: VaultKeyState;
  tavily: VaultKeyState;
  claude: VaultKeyState;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GeneratedScriptBlock {
  tipo: BloqueStoryboard['tipo'];
  titulo: string;
  inicio_s: number;
  fin_s: number;
  dialogo: string;
  texto_pantalla?: string;
  plano?: string;
  camara?: string;
  indicaciones?: string;
  edicion?: string[];
  sketch_prompt?: string;
}

export interface GeneratedIdeaItem {
  titulo: string;
  texto_base: string;
  pilar?: string;
  formato?: string;
  palabras_clave?: string;
  nivel_conciencia?: number | null;
  tendencia_usada?: string;
}

export interface AIGenerationMeta {
  providerLabel: string;
  trendSummary?: string;
  trendSourceLabel?: string;
  sources: GroundingSource[];
}

export const AI_CONFIG_CHANGED_EVENT = 'pronter-ai-config-changed';

export const DEFAULT_EXPERT_PERSONA = `Eres un director creativo y estratega senior en marketing digital, viralidad orgánica y cultura de internet (Reels, TikTok y Shorts).
Tu método:
1. Analizas tendencias actuales, conversaciones calientes, memes vigentes y referencias culturales de la región para aterrizarlos con naturalidad a la marca (sin forzar ni sonar robótico).
2. Aplicas la metodología de Viralidad: Filtro 5-50 (lo entiende alguien de 5 años, le interesa a 50 de 100), niveles de conciencia 0-4 y estructura Gancho -> Historia -> Moraleja -> CTA.
3. Escribes en español natural, cercano, directo y con alto potencial de retención (primeros 0,6 s impactantes, ritmo hablado ~3 palabras por segundo).`;

const AI_CONFIG_KEY = 'pronter-ai-config-v1';
const BRAND_CONTEXT_KEY = 'guion-en-pantalla-brand-context-v1';

export const GEMINI_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Por defecto · Mejor criterio · Free Tier)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Respaldo 1 · Rápido y estable · Free Tier)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Respaldo 2 · Flash reciente · Free Tier)' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Respaldo 3 · Free Tier)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (Respaldo 4 · Ultra ligero · Free Tier)' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Máxima calidad · Créditos Pro)' },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon (Frontier · Créditos Pro)' }
];

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Alta calidad)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Más económico)' }
];

export const TRENDS_SOURCES: { value: TrendsSource; label: string }[] = [
  { value: 'auto', label: 'Automático (Trends + News gratis / Tavily si hay clave)' },
  { value: 'trends-rss', label: 'Google Trends + Google News RSS (Gratis $0 · Supabase)' },
  { value: 'tavily', label: 'Tavily Search IA (Gratis 1,000/mes sin tarjeta)' },
  { value: 'gemini-search', label: 'Google Search nativo de Gemini (Créditos Pro / Billing)' },
  { value: 'off', label: 'Desactivado (sin búsqueda web previa)' }
];

export const TRENDS_GEOS = [
  { code: 'CO', label: 'Colombia (CO)' },
  { code: 'MX', label: 'México (MX)' },
  { code: 'ES', label: 'España (ES)' },
  { code: 'AR', label: 'Argentina (AR)' },
  { code: 'CL', label: 'Chile (CL)' },
  { code: 'PE', label: 'Perú (PE)' },
  { code: 'US', label: 'Estados Unidos (US)' }
];

const FREE_TIER_FALLBACKS = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

function emitConfigChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_CONFIG_CHANGED_EVENT));
  }
}

export function getBrandContext(): string {
  try {
    return localStorage.getItem(BRAND_CONTEXT_KEY) || '';
  } catch {
    return '';
  }
}

export function setBrandContext(text: string): void {
  try {
    localStorage.setItem(BRAND_CONTEXT_KEY, text.trim());
  } catch {
    // ignore
  }
}

export function getAIConfig(): AIConfig {
  const defaults: AIConfig = {
    provider: 'claude-edge',
    geminiApiKey: '',
    geminiModel: 'gemini-4-hydrogen',
    claudeApiKey: '',
    claudeModel: 'claude-sonnet-4-6',
    trendsSource: 'auto',
    trendsGeo: 'CO',
    tavilyApiKey: '',
    useTrendsSearch: true,
    marketRegion: 'Colombia y Latinoamérica',
    expertPersona: DEFAULT_EXPERT_PERSONA,
    updatedAt: 0,
    updatedBy: ''
  };
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AIConfig>;
    const migratedModel =
      parsed.geminiModel === 'gemini-2.5-flash' || parsed.geminiModel === 'gemini-2.5-pro'
        ? defaults.geminiModel
        : parsed.geminiModel;
    const migratedTrendsSource: TrendsSource =
      parsed.trendsSource || (parsed.useTrendsSearch === false ? 'off' : 'auto');
    return {
      ...defaults,
      ...parsed,
      geminiModel: migratedModel || defaults.geminiModel,
      trendsSource: migratedTrendsSource,
      trendsGeo: parsed.trendsGeo || defaults.trendsGeo,
      expertPersona: parsed.expertPersona?.trim() || DEFAULT_EXPERT_PERSONA,
      marketRegion: parsed.marketRegion?.trim() || defaults.marketRegion
    };
  } catch {
    return defaults;
  }
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    emitConfigChanged();
  } catch {
    // ignore
  }
}

function toSyncedPayload(cfg: AIConfig, brandCtx: string): SyncedAIConfigData {
  return {
    provider: cfg.provider,
    geminiModel: cfg.geminiModel,
    claudeModel: cfg.claudeModel,
    trendsSource: cfg.trendsSource,
    trendsGeo: cfg.trendsGeo,
    marketRegion: cfg.marketRegion,
    expertPersona: cfg.expertPersona,
    brandContext: brandCtx.trim(),
    updatedAt: cfg.updatedAt || Date.now(),
    updatedBy: cfg.updatedBy
  };
}

export function applyRemoteSyncedAIConfig(remote: SyncedAIConfigData): boolean {
  const current = getAIConfig();
  const next: AIConfig = {
    ...current,
    provider: remote.provider || current.provider,
    geminiModel: remote.geminiModel || current.geminiModel,
    claudeModel: remote.claudeModel || current.claudeModel,
    trendsSource: remote.trendsSource || current.trendsSource,
    trendsGeo: remote.trendsGeo || current.trendsGeo,
    useTrendsSearch: (remote.trendsSource || current.trendsSource) !== 'off',
    marketRegion: remote.marketRegion || current.marketRegion,
    expertPersona: remote.expertPersona?.trim() || current.expertPersona,
    updatedAt: remote.updatedAt,
    updatedBy: remote.updatedBy || current.updatedBy
  };
  if (typeof remote.brandContext === 'string') {
    setBrandContext(remote.brandContext);
  }
  saveAIConfig(next);
  return true;
}

export function initAIConfigSync(): void {
  registerAIConfigSyncAdapter({
    getLocalUpdatedAt: () => getAIConfig().updatedAt || 0,
    getSyncPayload: () => toSyncedPayload(getAIConfig(), getBrandContext()),
    applyRemote: applyRemoteSyncedAIConfig
  });
}

// Register immediately on module load
initAIConfigSync();

/**
 * Saves AI settings locally AND propagates non-secret config to all team devices via Supabase.
 */
export async function saveAndSyncAIConfig(
  config: AIConfig,
  brandCtx: string,
  updatedBy?: string
): Promise<{ synced: boolean }> {
  const now = Date.now();
  const next: AIConfig = {
    ...config,
    useTrendsSearch: config.trendsSource !== 'off',
    updatedAt: now,
    updatedBy: updatedBy || config.updatedBy || undefined
  };
  setBrandContext(brandCtx);
  saveAIConfig(next);
  const synced = await pushAIConfigToCloud(toSyncedPayload(next, brandCtx));
  return { synced };
}

export function getActiveProviderLabel(cfg = getAIConfig()): string {
  if (cfg.provider === 'gemini') {
    const match = GEMINI_MODELS.find((m) => m.id === cfg.geminiModel);
    if (match) return match.label.split(' (')[0];
    return cfg.geminiModel || 'Gemini';
  }
  if (cfg.provider === 'claude-direct') {
    return cfg.claudeModel.includes('haiku') ? 'Claude Haiku (Directo)' : 'Claude Sonnet (Directo)';
  }
  return 'Claude (Servidor)';
}

function formatUsedModelLabel(cfg: AIConfig, modelUsed: string): string {
  const base = getActiveProviderLabel(cfg);
  if (modelUsed === cfg.geminiModel) return base;
  const fallbackMatch = GEMINI_MODELS.find((m) => m.id === modelUsed);
  const fallbackName = fallbackMatch ? fallbackMatch.label.split(' (')[0] : modelUsed;
  return `${fallbackName} (respaldo de ${base})`;
}

// ---------- Encrypted Team Vault via Supabase Edge Function (ai-proxy) ----------

export async function getTeamVaultStatus(): Promise<TeamVaultStatus> {
  const empty: TeamVaultStatus = {
    deployed: false,
    gemini: { configured: false, hint: '' },
    tavily: { configured: false, hint: '' },
    claude: { configured: false, hint: '' }
  };
  const client = getSupabaseClient();
  if (!client) return empty;
  try {
    const { data, error } = await client.functions.invoke('ai-proxy', {
      body: { action: 'status', spaceKey: getSpaceKey() }
    });
    if (error || !data || data.error) return empty;
    return {
      deployed: true,
      gemini: data.gemini || { configured: false, hint: '' },
      tavily: data.tavily || { configured: false, hint: '' },
      claude: data.claude || { configured: false, hint: '' }
    };
  } catch {
    return empty;
  }
}

async function readEdgeErrorDetail(error: unknown): Promise<string> {
  const fallback =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || 'Error en Edge Function')
      : 'Error en Edge Function';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      const errBody = (await ctx.json()) as { error?: string };
      if (errBody?.error) return errBody.error;
    }
  } catch {
    // ignore parse failure
  }
  return fallback;
}

export async function saveEncryptedTeamKey(
  keyName: 'gemini' | 'tavily' | 'claude',
  apiKey: string
): Promise<{ hint: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const { data, error } = await client.functions.invoke('ai-proxy', {
    body: {
      action: 'save_key',
      spaceKey: getSpaceKey(),
      keyName,
      apiKey: apiKey.trim()
    }
  });
  if (error) {
    const detail = await readEdgeErrorDetail(error);
    throw new Error(`No se pudo cifrar en Supabase (${detail}).`);
  }
  if (data?.error) throw new Error(String(data.error));
  return { hint: String(data?.hint || '••••') };
}

export async function clearEncryptedTeamKey(
  keyName: 'gemini' | 'tavily' | 'claude'
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.functions.invoke('ai-proxy', {
    body: {
      action: 'clear_key',
      spaceKey: getSpaceKey(),
      keyName
    }
  });
  if (error) throw new Error(await readEdgeErrorDetail(error));
  if (data?.error) throw new Error(String(data.error));
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

export function parseJsonLenient<T>(rawText: string): T | null {
  const cleaned = stripMarkdownFences(rawText);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callGeminiSingleModel(input: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
  useSearch?: boolean;
}): Promise<{ status: number; text: string; sources: GroundingSource[]; errorMsg?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    input.model
  )}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }]
  };

  if (input.systemPrompt?.trim()) {
    body.systemInstruction = { parts: [{ text: input.systemPrompt.trim() }] };
  }

  if (input.useSearch) {
    body.tools = [{ google_search: {} }];
  }

  if (input.jsonMode) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.75
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey.trim()
    },
    body: JSON.stringify(body)
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
      };
    }>;
  };

  if (!res.ok) {
    const msg = payload?.error?.message || `HTTP ${res.status}`;
    return { status: res.status, text: '', sources: [], errorMsg: msg };
  }

  const candidate = payload?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => p.text || '')
    .join('\n')
    .trim();

  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = [];
  const seen = new Set<string>();
  for (const ch of chunks) {
    const uri = ch.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: ch.web?.title || uri, uri });
    }
  }

  return { status: res.status, text, sources };
}

async function callGeminiUnified(input: {
  cfg: AIConfig;
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
  useSearch?: boolean;
}): Promise<{ text: string; sources: GroundingSource[]; modelUsed: string }> {
  const localKey = input.cfg.geminiApiKey.trim();
  if (!localKey) {
    // Use encrypted server vault via Supabase ai-proxy (teammates never see the key)
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Falta clave de Gemini o conexión con Supabase.');
    }
    const { data, error } = await client.functions.invoke('ai-proxy', {
      body: {
        action: 'call_gemini',
        spaceKey: getSpaceKey(),
        model: input.cfg.geminiModel,
        systemPrompt: input.systemPrompt || '',
        userPrompt: input.userPrompt,
        jsonMode: Boolean(input.jsonMode),
        useSearch: Boolean(input.useSearch)
      }
    });
    if (error) {
      throw new Error(await readEdgeErrorDetail(error));
    }
    if (data?.error) throw new Error(String(data.error));
    return {
      text: String(data?.text || ''),
      sources: (data?.sources || []) as GroundingSource[],
      modelUsed: String(data?.modelUsed || input.cfg.geminiModel)
    };
  }

  const candidates = [
    input.cfg.geminiModel,
    ...FREE_TIER_FALLBACKS.filter((m) => m !== input.cfg.geminiModel)
  ];

  let lastError = '';
  for (let i = 0; i < candidates.length; i++) {
    const m = candidates[i];
    const result = await callGeminiSingleModel({
      apiKey: localKey,
      model: m,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      jsonMode: input.jsonMode,
      useSearch: input.useSearch
    });
    if (result.status >= 200 && result.status < 300) {
      return { text: result.text, sources: result.sources, modelUsed: m };
    }
    lastError = `Error de Gemini (${result.status} en ${m}): ${result.errorMsg || 'Error'}`;
    const shouldRetry =
      !input.useSearch && (result.status === 503 || result.status === 429 || result.status === 404);
    if (!shouldRetry) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

async function callClaudeDirectUnified(input: {
  cfg: AIConfig;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const localKey = input.cfg.claudeApiKey.trim();
  if (!localKey) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Falta API Key de Claude o conexión con Supabase.');
    const { data, error } = await client.functions.invoke('ai-proxy', {
      body: {
        action: 'call_claude',
        spaceKey: getSpaceKey(),
        model: input.cfg.claudeModel,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt
      }
    });
    if (error) throw new Error(await readEdgeErrorDetail(error));
    if (data?.error) throw new Error(String(data.error));
    return String(data?.text || '');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': localKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: input.cfg.claudeModel,
      max_tokens: 4096,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }]
    })
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    content?: Array<{ text?: string }>;
  };

  if (!res.ok) {
    throw new Error(`Error de Claude (${res.status}): ${payload?.error?.message || res.statusText}`);
  }

  return payload?.content?.[0]?.text || '';
}

async function callClaudeEdge(input: {
  titulo: string;
  textoBase?: string;
  pilar?: string;
  formato?: string;
  objetivo?: string;
  ganchoTipo?: string;
  duracionSegundos?: number;
  tono?: string;
}): Promise<GeneratedScriptBlock[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');

  const { data, error } = await client.functions.invoke('generar-guion', {
    body: input
  });

  if (error) {
    throw new Error(await readEdgeErrorDetail(error));
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  const bloques = (data?.bloques || []) as GeneratedScriptBlock[];
  if (!Array.isArray(bloques) || bloques.length === 0) {
    throw new Error('La IA no devolvió escenas.');
  }
  return bloques;
}

// ---------- Multi-source Live Trends Fetchers ----------

async function fetchGoogleTrendsRss(
  topic: string,
  geo: string
): Promise<{ summary: string; sources: GroundingSource[] }> {
  const client = getSupabaseClient();
  if (!client) return { summary: '', sources: [] };
  try {
    const { data, error } = await client.functions.invoke('tendencias-hoy', {
      body: { topic, geo }
    });
    if (error || !data || data.error) return { summary: '', sources: [] };
    const trending = (data.trendingNow || []) as string[];
    const news = (data.nicheNews || []) as Array<{ title: string; link: string }>;
    const lines: string[] = [];
    if (trending.length > 0) {
      lines.push(`Tendencias de hoy en Google (${geo}): ${trending.slice(0, 8).join(' · ')}`);
    }
    if (news.length > 0) {
      lines.push(
        'Noticias y temas recientes:\n' +
          news
            .slice(0, 5)
            .map((n) => `- ${n.title}`)
            .join('\n')
      );
    }
    return {
      summary: lines.join('\n\n'),
      sources: (data.sources || []) as GroundingSource[]
    };
  } catch {
    return { summary: '', sources: [] };
  }
}

async function fetchTavilyTrends(
  topic: string,
  cfg: AIConfig
): Promise<{ summary: string; sources: GroundingSource[] }> {
  const query = `tendencias virales memes noticias recientes ${topic} ${cfg.marketRegion}`.trim();
  const localKey = cfg.tavilyApiKey.trim();

  try {
    let data: {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    } | null = null;

    if (localKey) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: localKey,
          query,
          topic: 'news',
          days: 7,
          max_results: 6,
          include_answer: true
        })
      });
      if (res.ok) data = await res.json();
    } else {
      const client = getSupabaseClient();
      if (client) {
        const res = await client.functions.invoke('ai-proxy', {
          body: { action: 'call_tavily', spaceKey: getSpaceKey(), query }
        });
        if (!res.error && res.data && !res.data.error) {
          data = res.data;
        }
      }
    }

    if (!data) return { summary: '', sources: [] };

    const lines: string[] = [];
    if (data.answer) lines.push(data.answer);
    const results = data.results || [];
    for (const r of results.slice(0, 5)) {
      if (r.title) lines.push(`- ${r.title}: ${(r.content || '').slice(0, 140)}`);
    }
    const sources: GroundingSource[] = results
      .filter((r) => r.url && r.title)
      .slice(0, 5)
      .map((r) => ({ title: r.title!, uri: r.url! }));

    return { summary: lines.join('\n'), sources };
  } catch {
    return { summary: '', sources: [] };
  }
}

async function fetchGeminiSearchTrends(
  topic: string,
  cfg: AIConfig,
  brandContext: string
): Promise<{ summary: string; sources: GroundingSource[] }> {
  if (cfg.provider !== 'gemini') return { summary: '', sources: [] };
  const today = new Date().toISOString().slice(0, 10);
  const searchPrompt = [
    `Hoy es ${today}. Investiga en Google tendencias actuales, noticias recientes, temas virales, formatos y memes vigentes en ${cfg.marketRegion} relevantes para crear videos cortos (Reels/TikTok) sobre:`,
    `Tema: ${topic}`,
    brandContext ? `Marca / negocio: ${brandContext}` : '',
    'Devuelve en español un resumen práctico (máximo 8 viñetas) con tendencias/noticias y memes aprovechables.'
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await callGeminiUnified({
      cfg,
      userPrompt: searchPrompt,
      jsonMode: false,
      useSearch: true
    });
    return { summary: res.text, sources: res.sources };
  } catch {
    return { summary: '', sources: [] };
  }
}

/**
 * Fetches live trends/news/memes according to configured TrendsSource.
 * Works across both Gemini and Claude.
 */
export async function researchCurrentTrends(
  topic: string,
  cfg: AIConfig,
  brandContext: string,
  overrideEnabled?: boolean
): Promise<{ summary: string; sources: GroundingSource[]; sourceLabel?: string }> {
  if (overrideEnabled === false || cfg.trendsSource === 'off') {
    return { summary: '', sources: [] };
  }

  const mode = cfg.trendsSource;

  if (mode === 'trends-rss') {
    const rss = await fetchGoogleTrendsRss(topic, cfg.trendsGeo);
    return {
      ...rss,
      sourceLabel: rss.summary ? `Google Trends + News (${cfg.trendsGeo})` : undefined
    };
  }

  if (mode === 'tavily') {
    const tav = await fetchTavilyTrends(topic, cfg);
    return { ...tav, sourceLabel: tav.summary ? 'Tavily IA' : undefined };
  }

  if (mode === 'gemini-search') {
    const gem = await fetchGeminiSearchTrends(topic, cfg, brandContext);
    return { ...gem, sourceLabel: gem.summary ? 'Google Search (Gemini)' : undefined };
  }

  // 'auto' mode: try free RSS + Tavily in parallel, fallback cleanly
  const [rss, tav] = await Promise.all([
    fetchGoogleTrendsRss(topic, cfg.trendsGeo),
    fetchTavilyTrends(topic, cfg)
  ]);

  const parts = [tav.summary, rss.summary].filter(Boolean);
  const labels = [
    tav.summary ? 'Tavily' : '',
    rss.summary ? `Google Trends (${cfg.trendsGeo})` : ''
  ].filter(Boolean);
  const combinedSources = [...tav.sources, ...rss.sources];

  if (parts.length > 0) {
    return {
      summary: parts.join('\n\n'),
      sources: combinedSources.slice(0, 6),
      sourceLabel: labels.join(' + ')
    };
  }

  // Last try in auto mode if paid Gemini Search is active
  if (cfg.provider === 'gemini') {
    const gem = await fetchGeminiSearchTrends(topic, cfg, brandContext);
    if (gem.summary) {
      return { ...gem, sourceLabel: 'Google Search (Gemini)' };
    }
  }

  return { summary: '', sources: [] };
}

export async function testTrendsConnection(cfg = getAIConfig()): Promise<string> {
  const res = await researchCurrentTrends('negocios marketing ecommerce', cfg, '', true);
  if (!res.summary) {
    throw new Error(
      'No se obtuvieron tendencias. Despliega supabase/functions/tendencias-hoy o agrega una clave gratuita de Tavily.'
    );
  }
  return `Tendencias activas (${res.sourceLabel || cfg.trendsSource}): ${res.sources.length} fuentes leídas.`;
}

export async function testAIConnection(cfg = getAIConfig()): Promise<string> {
  if (cfg.provider === 'gemini') {
    const res = await callGeminiUnified({
      cfg,
      userPrompt: 'Responde únicamente: OK',
      jsonMode: false,
      useSearch: false
    });
    return `Conexión exitosa con ${formatUsedModelLabel(cfg, res.modelUsed)}: ${res.text.slice(0, 40)}`;
  }

  if (cfg.provider === 'claude-direct') {
    const text = await callClaudeDirectUnified({
      cfg,
      systemPrompt: 'Responde brevemente.',
      userPrompt: 'Responde únicamente: OK'
    });
    return `Conexión exitosa con ${getActiveProviderLabel(cfg)}: ${text.slice(0, 40)}`;
  }

  const blocks = await callClaudeEdge({
    titulo: 'Prueba rápida de conexión',
    textoBase: 'Devuelve exactamente 1 bloque corto de prueba.',
    duracionSegundos: 15
  });
  return `Conexión exitosa con Claude (Servidor): ${blocks.length} bloque recibido.`;
}

function buildSystemHeader(cfg: AIConfig, brandContext: string): string {
  return [
    cfg.expertPersona.trim(),
    `Mercado / Región principal: ${cfg.marketRegion}.`,
    brandContext ? `Contexto fijo de la marca:\n${brandContext}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatHookCatalogSummary(hookTypes?: GanchoTipo[]): string {
  if (!hookTypes || hookTypes.length === 0) return '';
  const sample = hookTypes
    .slice(0, 35)
    .map((h) => `#${h.numero} ${h.nombre} (${h.plantilla})`)
    .join(' | ');
  return `Tipos de gancho disponibles en el sistema: ${sample}`;
}

export async function generateScriptExpertWithAI(input: {
  titulo: string;
  textoBase?: string;
  pilar?: string;
  formato?: string;
  objetivo?: string;
  ganchoTipo?: string;
  duracionSegundos?: number;
  tono?: string;
  useTrendsOverride?: boolean;
  hookTypes?: GanchoTipo[];
}): Promise<{ bloques: GeneratedScriptBlock[]; meta: AIGenerationMeta }> {
  const cfg = getAIConfig();
  const brandContext = getBrandContext();
  const duracion = input.duracionSegundos || 45;

  const trends = await researchCurrentTrends(
    `${input.titulo} ${input.textoBase || ''}`.trim(),
    cfg,
    brandContext,
    input.useTrendsOverride
  );

  if (cfg.provider === 'gemini') {
    const systemPrompt = `${buildSystemHeader(cfg, brandContext)}

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "bloques": [
    {
      "tipo": "gancho" | "historia" | "moraleja" | "cta",
      "titulo": "Nombre corto",
      "inicio_s": 0,
      "fin_s": 4,
      "dialogo": "Texto exacto hablado",
      "texto_pantalla": "Texto corto en pantalla",
      "plano": "Plano de cámara sugerido",
      "camara": "Movimiento o encuadre",
      "indicaciones": "Nota de interpretación o referencia visual",
      "edicion": ["Corte rápido", "Zoom sutil"],
      "sketch_prompt": "Descripción visual concreta del boceto de esta escena"
    }
  ]
}
Reglas:
- Ritmo hablado ~3 palabras por segundo (apunta a ~${duracion} segundos totales).
- Gancho fuerte en 0-4s (idealmente <= 12 palabras y algo visual/concreto), historia con retención, moraleja de autoridad y CTA claro.
- Si hay tendencias o memes investigados arriba, aprovéchalos donde sume impacto sin perder foco comercial.`;

    const userPrompt = [
      `Tema / Título: ${input.titulo}`,
      input.textoBase ? `Instrucciones / Contexto: ${input.textoBase}` : '',
      input.pilar ? `Pilar: ${input.pilar}` : '',
      input.formato ? `Formato: ${input.formato}` : '',
      input.objetivo ? `Objetivo: ${input.objetivo}` : '',
      input.ganchoTipo ? `Estilo de gancho: ${input.ganchoTipo}` : '',
      input.tono ? `Tono: ${input.tono}` : '',
      formatHookCatalogSummary(input.hookTypes),
      trends.summary ? `Tendencias, temas y memes actuales encontrados:\n${trends.summary}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await callGeminiUnified({
      cfg,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      useSearch: false
    });

    const parsed = parseJsonLenient<{ bloques?: GeneratedScriptBlock[] }>(res.text);
    if (!parsed?.bloques?.length) {
      throw new Error('Gemini no devolvió escenas válidas.');
    }

    return {
      bloques: parsed.bloques,
      meta: {
        providerLabel: formatUsedModelLabel(cfg, res.modelUsed),
        trendSummary: trends.summary || undefined,
        trendSourceLabel: trends.sourceLabel,
        sources: trends.sources
      }
    };
  }

  const enrichedBase = [
    buildSystemHeader(cfg, brandContext),
    input.textoBase || '',
    formatHookCatalogSummary(input.hookTypes),
    trends.summary ? `Tendencias, temas y memes actuales encontrados:\n${trends.summary}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  if (cfg.provider === 'claude-direct') {
    const systemPrompt = `${buildSystemHeader(cfg, brandContext)}
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown):
{"bloques":[{"tipo":"gancho"|"historia"|"moraleja"|"cta","titulo":"...","inicio_s":0,"fin_s":4,"dialogo":"...","texto_pantalla":"...","plano":"...","camara":"...","indicaciones":"...","edicion":["..."],"sketch_prompt":"..."}]}
Apunta a ~${duracion}s (~3 palabras/segundo).`;

    const userPrompt = [
      `Tema / Título: ${input.titulo}`,
      input.textoBase ? `Instrucciones: ${input.textoBase}` : '',
      input.pilar ? `Pilar: ${input.pilar}` : '',
      input.formato ? `Formato: ${input.formato}` : '',
      input.objetivo ? `Objetivo: ${input.objetivo}` : '',
      input.ganchoTipo ? `Gancho: ${input.ganchoTipo}` : '',
      input.tono ? `Tono: ${input.tono}` : '',
      formatHookCatalogSummary(input.hookTypes),
      trends.summary ? `Tendencias actuales:\n${trends.summary}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await callClaudeDirectUnified({ cfg, systemPrompt, userPrompt });
    const parsed = parseJsonLenient<{ bloques?: GeneratedScriptBlock[] }>(raw);
    if (!parsed?.bloques?.length) {
      throw new Error('Claude no devolvió escenas válidas.');
    }
    return {
      bloques: parsed.bloques,
      meta: {
        providerLabel: getActiveProviderLabel(cfg),
        trendSummary: trends.summary || undefined,
        trendSourceLabel: trends.sourceLabel,
        sources: trends.sources
      }
    };
  }

  const bloques = await callClaudeEdge({
    ...input,
    textoBase: enrichedBase || undefined
  });

  return {
    bloques,
    meta: {
      providerLabel: getActiveProviderLabel(cfg),
      trendSummary: trends.summary || undefined,
      trendSourceLabel: trends.sourceLabel,
      sources: trends.sources
    }
  };
}

export async function generateIdeasExpertWithAI(input: {
  tema: string;
  cantidad?: number;
  pilar?: string;
  formato?: string;
  existingTitles?: string[];
  hookTypes?: GanchoTipo[];
  useTrendsOverride?: boolean;
}): Promise<{ ideas: GeneratedIdeaItem[]; meta: AIGenerationMeta }> {
  const cfg = getAIConfig();
  const brandContext = getBrandContext();
  const count = input.cantidad || 5;

  const existingHint =
    input.existingTitles && input.existingTitles.length > 0
      ? `NO repitas ni recicles estas ideas ya existentes:\n- ${input.existingTitles
          .slice(0, 25)
          .join('\n- ')}`
      : '';

  const trends = await researchCurrentTrends(
    input.tema,
    cfg,
    brandContext,
    input.useTrendsOverride
  );

  if (cfg.provider === 'gemini') {
    const systemPrompt = `${buildSystemHeader(cfg, brandContext)}

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "ideas": [
    {
      "titulo": "Título gancho claro y atractivo",
      "texto_base": "Resumen accionable de la idea en 1 a 3 frases (qué se dice, qué pasa y cierre)",
      "pilar": "Pilar sugerido",
      "formato": "Formato sugerido (ej. Hablando a cámara, Vlog, Entrevista, POV)",
      "palabras_clave": "PALABRA_CTA",
      "nivel_conciencia": 1,
      "tendencia_usada": "Breve referencia a la tendencia o meme aprovechado (si aplica)"
    }
  ]
}
Genera exactamente ${count} ideas distintas que pasen el Filtro 5-50.`;

    const userPrompt = [
      `Tema / producto / enfoque pedido: ${input.tema}`,
      input.pilar ? `Pilar preferido: ${input.pilar}` : '',
      input.formato ? `Formato preferido: ${input.formato}` : '',
      formatHookCatalogSummary(input.hookTypes),
      existingHint,
      trends.summary ? `Tendencias, temas calientes y memes actuales:\n${trends.summary}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await callGeminiUnified({
      cfg,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      useSearch: false
    });

    const parsed = parseJsonLenient<{ ideas?: GeneratedIdeaItem[] }>(res.text);
    if (!parsed?.ideas?.length) {
      throw new Error('Gemini no devolvió ideas válidas.');
    }

    return {
      ideas: parsed.ideas,
      meta: {
        providerLabel: formatUsedModelLabel(cfg, res.modelUsed),
        trendSummary: trends.summary || undefined,
        trendSourceLabel: trends.sourceLabel,
        sources: trends.sources
      }
    };
  }

  // Claude (Edge or Direct)
  const instruction = [
    `Devuelve el JSON con bloques donde cada bloque sea una idea diferente de video (titulo = titulo corto de la idea, dialogo = resumen breve de 1 a 2 frases con enfoque viral/tendencia, texto_pantalla = formato recomendado, indicaciones = palabra clave o nota de tendencia). Genera exactamente ${count} bloques cortos en el JSON.`,
    existingHint,
    trends.summary ? `Tendencias, temas calientes y memes actuales:\n${trends.summary}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await generateScriptExpertWithAI({
    titulo: `${count} ideas virales sobre: ${input.tema}`,
    textoBase: instruction,
    pilar: input.pilar,
    formato: input.formato,
    duracionSegundos: 30,
    useTrendsOverride: false,
    hookTypes: input.hookTypes
  });

  const ideas: GeneratedIdeaItem[] = res.bloques
    .filter((b) => b.titulo?.trim())
    .map((b) => ({
      titulo: b.titulo.trim(),
      texto_base: b.dialogo?.trim() || '',
      pilar: input.pilar || undefined,
      formato: input.formato || (b.texto_pantalla || '').replace(/^Formato:\s*/i, '').trim() || undefined,
      tendencia_usada: b.indicaciones?.trim() || undefined
    }));

  return {
    ideas,
    meta: {
      ...res.meta,
      trendSummary: trends.summary || res.meta.trendSummary,
      trendSourceLabel: trends.sourceLabel || res.meta.trendSourceLabel,
      sources: trends.sources.length ? trends.sources : res.meta.sources
    }
  };
}

export async function completeStoryboardWithAI(input: {
  titulo: string;
  escenas: BloqueStoryboard[];
  objetivo?: string | null;
  tono?: string | null;
}): Promise<{
  updates: Array<{
    orden: number;
    plano: string;
    camara: string;
    edicion: string[];
    texto_pantalla: string;
    sketch_texto: string;
    sketch_prompt: string;
  }>;
  meta: AIGenerationMeta;
}> {
  const cfg = getAIConfig();
  const brandContext = getBrandContext();

  const scenesDescription = input.escenas
    .map(
      (s, idx) =>
        `Escena ${idx + 1} (${s.tipo}, ${s.inicio_s ?? 0}-${s.fin_s ?? 0}s): Diálogo: "${s.dialogo}"`
    )
    .join('\n');

  if (cfg.provider === 'gemini') {
    const systemPrompt = `${buildSystemHeader(cfg, brandContext)}

Eres director de producción y storyboard para Reels/TikTok.
Completa los detalles técnicos y visuales de cada escena SIN cambiar los diálogos.
Responde ÚNICAMENTE con JSON válido:
{
  "escenas": [
    {
      "orden": 1,
      "plano": "Plano concreto (ej. Medio corto (frontal), Plano detalle)",
      "camara": "Movimiento o encuadre (ej. Estática, Leve acercamiento)",
      "edicion": ["Corte en segundo 2", "Subtítulo resaltado", "B-roll rápido"],
      "texto_pantalla": "0:00 TEXTO CORTO EN MAYÚSCULAS",
      "sketch_texto": "Qué se debe ver visualmente en el boceto",
      "sketch_prompt": "Descripción detallada para dibujar la escena en storyboard a lápiz 3:2"
    }
  ]
}`;

    const userPrompt = [
      `Guion: ${input.titulo}`,
      input.objetivo ? `Objetivo: ${input.objetivo}` : '',
      input.tono ? `Tono: ${input.tono}` : '',
      `Escenas:\n${scenesDescription}`
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await callGeminiUnified({
      cfg,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      useSearch: false
    });

    const parsed = parseJsonLenient<{
      escenas?: Array<{
        orden: number;
        plano: string;
        camara: string;
        edicion: string[];
        texto_pantalla: string;
        sketch_texto: string;
        sketch_prompt: string;
      }>;
    }>(res.text);

    if (!parsed?.escenas?.length) {
      throw new Error('Gemini no devolvió detalles de storyboard válidos.');
    }
    return {
      updates: parsed.escenas,
      meta: { providerLabel: formatUsedModelLabel(cfg, res.modelUsed), sources: [] }
    };
  }

  const res = await generateScriptExpertWithAI({
    titulo: `Storyboard técnico para: ${input.titulo}`,
    textoBase: `Completa plano, camara, indicaciones (nota visual), texto_pantalla y edicion para exactamente estas ${input.escenas.length} escenas en orden:\n${scenesDescription}`,
    objetivo: input.objetivo || undefined,
    tono: input.tono || undefined,
    duracionSegundos: 45,
    useTrendsOverride: false
  });

  return {
    updates: input.escenas.map((_, idx) => {
      const b = res.bloques[idx];
      return {
        orden: idx + 1,
        plano: b?.plano || 'Medio corto (frontal)',
        camara: b?.camara || 'Estática',
        edicion: Array.isArray(b?.edicion) ? b.edicion : b?.indicaciones ? [b.indicaciones] : [],
        texto_pantalla: b?.texto_pantalla || '',
        sketch_texto: b?.indicaciones || '',
        sketch_prompt: b?.sketch_prompt || b?.indicaciones || ''
      };
    }),
    meta: res.meta
  };
}
