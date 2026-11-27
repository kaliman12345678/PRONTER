import { getSupabaseClient } from '../db/cloudSync';
import type { BloqueStoryboard, GanchoTipo } from '../types/reellab';

export type AIProvider = 'gemini' | 'claude-edge' | 'claude-direct';

export interface AIConfig {
  provider: AIProvider;
  geminiApiKey: string;
  geminiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  useTrendsSearch: boolean;
  marketRegion: string;
  expertPersona: string;
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
  sources: GroundingSource[];
}

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

const FREE_TIER_FALLBACKS = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Alta calidad)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Más económico)' }
];

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
    useTrendsSearch: true,
    marketRegion: 'Colombia y Latinoamérica',
    expertPersona: DEFAULT_EXPERT_PERSONA
  };
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AIConfig>;
    const migratedModel =
      parsed.geminiModel === 'gemini-2.5-flash' || parsed.geminiModel === 'gemini-2.5-pro'
        ? defaults.geminiModel
        : parsed.geminiModel;
    return {
      ...defaults,
      ...parsed,
      geminiModel: migratedModel || defaults.geminiModel,
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
  } catch {
    // ignore
  }
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

async function callGeminiREST(input: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
  useSearch?: boolean;
}): Promise<{ text: string; sources: GroundingSource[]; modelUsed: string }> {
  const candidates = [
    input.model,
    ...FREE_TIER_FALLBACKS.filter((m) => m !== input.model)
  ];

  let lastError = '';
  for (let i = 0; i < candidates.length; i++) {
    const m = candidates[i];
    const result = await callGeminiSingleModel({ ...input, model: m });
    if (result.status >= 200 && result.status < 300) {
      return { text: result.text, sources: result.sources, modelUsed: m };
    }
    lastError = `Error de Gemini (${result.status} en ${m}): ${result.errorMsg || 'Error'}`;
    // Cascade to next backup model on 503 overload, 429 per-model quota, or 404 deprecated model
    const shouldRetry =
      !input.useSearch && (result.status === 503 || result.status === 429 || result.status === 404);
    if (!shouldRetry) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

async function callClaudeDirectREST(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: input.model,
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
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const errBody = (await ctx.json()) as { error?: string };
        if (errBody?.error) detail = errBody.error;
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
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

/**
 * Phase 1 (Gemini Grounding): Searches real-time Google trends, news, and memes.
 */
export async function researchTrendsWithGemini(
  topic: string,
  cfg: AIConfig,
  brandContext: string
): Promise<{ summary: string; sources: GroundingSource[] }> {
  if (cfg.provider !== 'gemini' || !cfg.geminiApiKey.trim()) {
    return { summary: '', sources: [] };
  }

  const today = new Date().toISOString().slice(0, 10);
  const searchPrompt = [
    `Hoy es ${today}. Investiga en Google tendencias actuales, noticias recientes, temas virales, formatos y memes vigentes en ${cfg.marketRegion} relevantes para crear videos cortos (Reels/TikTok) sobre:`,
    `Tema: ${topic}`,
    brandContext ? `Marca / negocio: ${brandContext}` : '',
    'Devuelve en español un resumen práctico (máximo 8 viñetas) con: 1) tendencias/noticias reales recientes aprovechables, 2) memes o referencias culturales vigentes que encajen con humor o contexto, y 3) ángulos que estén generando debate o comentarios.'
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await callGeminiREST({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
      userPrompt: searchPrompt,
      jsonMode: false,
      useSearch: true
    });
    return { summary: res.text, sources: res.sources };
  } catch {
    // Graceful fallback if grounding fails on quota or unsupported model
    return { summary: '', sources: [] };
  }
}

function formatUsedModelLabel(cfg: AIConfig, modelUsed: string): string {
  const base = getActiveProviderLabel(cfg);
  if (modelUsed === cfg.geminiModel) return base;
  const fallbackMatch = GEMINI_MODELS.find((m) => m.id === modelUsed);
  const fallbackName = fallbackMatch ? fallbackMatch.label.split(' (')[0] : modelUsed;
  return `${fallbackName} (respaldo de ${base})`;
}

export async function testAIConnection(cfg = getAIConfig()): Promise<string> {
  if (cfg.provider === 'gemini') {
    if (!cfg.geminiApiKey.trim()) {
      throw new Error('Pega primero tu API Key de Google AI Studio (AQ... o AIza...).');
    }
    const res = await callGeminiREST({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
      userPrompt: 'Responde únicamente: OK',
      jsonMode: false,
      useSearch: false
    });
    return `Conexión exitosa con ${formatUsedModelLabel(cfg, res.modelUsed)}: ${res.text.slice(0, 40)}`;
  }

  if (cfg.provider === 'claude-direct') {
    if (!cfg.claudeApiKey.trim()) {
      throw new Error('Pega primero tu API Key de Anthropic (sk-ant-...).');
    }
    const text = await callClaudeDirectREST({
      apiKey: cfg.claudeApiKey,
      model: cfg.claudeModel,
      systemPrompt: 'Responde brevemente.',
      userPrompt: 'Responde únicamente: OK'
    });
    return `Conexión exitosa con ${getActiveProviderLabel(cfg)}: ${text.slice(0, 40)}`;
  }

  // claude-edge test
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
  const wantTrends = input.useTrendsOverride ?? cfg.useTrendsSearch;

  if (cfg.provider === 'gemini') {
    if (!cfg.geminiApiKey.trim()) {
      throw new Error('Falta tu API Key de Gemini en Ajustes.');
    }

    const trends = wantTrends
      ? await researchTrendsWithGemini(
          `${input.titulo} ${input.textoBase || ''}`.trim(),
          cfg,
          brandContext
        )
      : { summary: '', sources: [] };

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

    const res = await callGeminiREST({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
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
        sources: trends.sources
      }
    };
  }

  const enrichedBase = [
    buildSystemHeader(cfg, brandContext),
    input.textoBase || '',
    formatHookCatalogSummary(input.hookTypes)
  ]
    .filter(Boolean)
    .join('\n\n');

  if (cfg.provider === 'claude-direct') {
    if (!cfg.claudeApiKey.trim()) {
      throw new Error('Falta tu API Key de Claude en Ajustes.');
    }
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
      formatHookCatalogSummary(input.hookTypes)
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await callClaudeDirectREST({
      apiKey: cfg.claudeApiKey,
      model: cfg.claudeModel,
      systemPrompt,
      userPrompt
    });

    const parsed = parseJsonLenient<{ bloques?: GeneratedScriptBlock[] }>(raw);
    if (!parsed?.bloques?.length) {
      throw new Error('Claude no devolvió escenas válidas.');
    }
    return {
      bloques: parsed.bloques,
      meta: { providerLabel: getActiveProviderLabel(cfg), sources: [] }
    };
  }

  // Fallback / default: Supabase Edge Function (Claude)
  const bloques = await callClaudeEdge({
    ...input,
    textoBase: enrichedBase || undefined
  });

  return {
    bloques,
    meta: { providerLabel: getActiveProviderLabel(cfg), sources: [] }
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
  const wantTrends = input.useTrendsOverride ?? cfg.useTrendsSearch;

  const existingHint =
    input.existingTitles && input.existingTitles.length > 0
      ? `NO repitas ni recicles estas ideas ya existentes:\n- ${input.existingTitles
          .slice(0, 25)
          .join('\n- ')}`
      : '';

  if (cfg.provider === 'gemini') {
    if (!cfg.geminiApiKey.trim()) {
      throw new Error('Falta tu API Key de Gemini en Ajustes.');
    }

    const trends = wantTrends
      ? await researchTrendsWithGemini(input.tema, cfg, brandContext)
      : { summary: '', sources: [] };

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

    const res = await callGeminiREST({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
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
        sources: trends.sources
      }
    };
  }

  // Claude (Edge or Direct) reuses structured block prompt cleanly
  const instruction = [
    `Devuelve el JSON con bloques donde cada bloque sea una idea diferente de video (titulo = titulo corto de la idea, dialogo = resumen breve de 1 a 2 frases con enfoque viral/tendencia, texto_pantalla = formato recomendado, indicaciones = palabra clave o nota de tendencia). Genera exactamente ${count} bloques cortos en el JSON.`,
    existingHint
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

  return { ideas, meta: res.meta };
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
    if (!cfg.geminiApiKey.trim()) {
      throw new Error('Falta tu API Key de Gemini en Ajustes.');
    }

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

    const res = await callGeminiREST({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
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

  // Claude (Edge or Direct) fallback reusing generateScriptExpertWithAI
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
