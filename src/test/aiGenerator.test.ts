import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRemoteSyncedAIConfig,
  DEFAULT_EXPERT_PERSONA,
  generateIdeasExpertWithAI,
  generateScriptExpertWithAI,
  getActiveProviderLabel,
  getAIConfig,
  getBrandContext,
  parseJsonLenient,
  saveAIConfig,
  type AIConfig
} from '../services/aiGenerator';

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    provider: 'gemini',
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
    ...overrides
  };
}

describe('aiGenerator dual-provider & team sync service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to gemini with gemini-4-hydrogen and migrates legacy claude-edge', () => {
    expect(getAIConfig().provider).toBe('gemini');
    expect(getAIConfig().geminiModel).toBe('gemini-4-hydrogen');
    expect(getActiveProviderLabel()).toBe('Gemini 4 Hydrogen');

    localStorage.setItem('pronter-ai-config-v1', JSON.stringify({ provider: 'claude-edge' }));
    expect(getAIConfig().provider).toBe('gemini');

    saveAIConfig(
      makeConfig({
        provider: 'claude-direct',
        claudeModel: 'claude-sonnet-4-6'
      })
    );

    expect(getAIConfig().provider).toBe('claude-direct');
    expect(getActiveProviderLabel()).toBe('Claude Sonnet');
  });

  it('applies remote synced AI config without overwriting local secret keys', () => {
    saveAIConfig(
      makeConfig({
        provider: 'claude-direct',
        geminiApiKey: 'AQ.local-device-key'
      })
    );

    applyRemoteSyncedAIConfig({
      provider: 'gemini',
      geminiModel: 'gemini-4-hydrogen',
      claudeModel: 'claude-sonnet-4-6',
      trendsSource: 'tavily',
      trendsGeo: 'MX',
      marketRegion: 'México',
      expertPersona: 'Experto viral MX',
      brandContext: 'Marca demo MX',
      updatedAt: 123456,
      updatedBy: 'Juan Vargas'
    });

    const updated = getAIConfig();
    expect(updated.provider).toBe('gemini');
    expect(updated.trendsSource).toBe('tavily');
    expect(updated.trendsGeo).toBe('MX');
    expect(updated.updatedBy).toBe('Juan Vargas');
    expect(updated.geminiApiKey).toBe('AQ.local-device-key');
    expect(getBrandContext()).toBe('Marca demo MX');
  });

  it('parses lenient JSON even with markdown code fences', () => {
    const res = parseJsonLenient<{ ok: boolean }>('```json\n{"ok":true}\n```');
    expect(res).toEqual({ ok: true });
  });

  it('runs 2-phase Gemini Search Grounding + JSON script generation', async () => {
    saveAIConfig(
      makeConfig({
        provider: 'gemini',
        geminiApiKey: 'AQ.test-key',
        geminiModel: 'gemini-3.6-flash',
        trendsSource: 'gemini-search'
      })
    );

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: '- Meme tendencia de esta semana' }] },
                groundingMetadata: {
                  groundingChunks: [{ web: { title: 'Trend Source', uri: 'https://example.com/trend' } }]
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        bloques: [
                          {
                            tipo: 'gancho',
                            titulo: 'Gancho viral',
                            inicio_s: 0,
                            fin_s: 4,
                            dialogo: 'No hagas esto hoy',
                            texto_pantalla: '0:00 ERROR COMÚN',
                            plano: 'Medio corto',
                            camara: 'Estática',
                            edicion: ['Corte rápido'],
                            sketch_prompt: 'Presentador mirando a cámara'
                          }
                        ]
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      );

    const out = await generateScriptExpertWithAI({
      titulo: 'Prueba tendencia',
      duracionSegundos: 30
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(firstBody.tools).toEqual([{ google_search: {} }]);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(secondBody.generationConfig.responseMimeType).toBe('application/json');

    expect(out.bloques).toHaveLength(1);
    expect(out.bloques[0].dialogo).toBe('No hagas esto hoy');
    expect(out.meta.providerLabel).toBe('Gemini 3.6 Flash');
    expect(out.meta.trendSummary).toContain('Meme tendencia');
    expect(out.meta.sources[0].uri).toBe('https://example.com/trend');
  });

  it('falls back in order from gemini-4-hydrogen to gemini-3.6-flash on 503 overload', async () => {
    saveAIConfig(
      makeConfig({
        provider: 'gemini',
        geminiApiKey: 'AQ.test-key',
        geminiModel: 'gemini-4-hydrogen',
        trendsSource: 'off'
      })
    );

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'High demand' } }), { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        ideas: [
                          {
                            titulo: 'Idea rescatada por respaldo',
                            texto_base: 'Generada tras 503 de hydrogen'
                          }
                        ]
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      );

    const res = await generateIdeasExpertWithAI({
      tema: 'Respaldo',
      cantidad: 1,
      useTrendsOverride: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-4-hydrogen');
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-3.6-flash');
    expect(res.ideas[0].titulo).toBe('Idea rescatada por respaldo');
    expect(res.meta.providerLabel).toBe('Gemini 3.6 Flash (respaldo de Gemini 4 Hydrogen)');
  });

  it('uses Tavily free trends search before generating ideas with Gemini', async () => {
    saveAIConfig(
      makeConfig({
        provider: 'gemini',
        geminiApiKey: 'AQ.test-key',
        geminiModel: 'gemini-3.6-flash',
        trendsSource: 'tavily',
        tavilyApiKey: 'tvly-test-key'
      })
    );

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            answer: 'Tendencia fuerte en envíos gratis esta semana',
            results: [{ title: 'Noticia Ecommerce', url: 'https://news.example/1', content: 'Detalle' }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        ideas: [
                          {
                            titulo: 'Envíos gratis que sí dan margen',
                            texto_base: 'Aprovecha la tendencia semanal.'
                          }
                        ]
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      );

    const res = await generateIdeasExpertWithAI({
      tema: 'Ecommerce',
      cantidad: 1
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.tavily.com/search');
    expect(res.meta.trendSourceLabel).toBe('Tavily IA');
    expect(res.meta.sources[0].uri).toBe('https://news.example/1');
    expect(res.ideas[0].titulo).toBe('Envíos gratis que sí dan margen');
  });
});
