import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXPERT_PERSONA,
  generateIdeasExpertWithAI,
  generateScriptExpertWithAI,
  getActiveProviderLabel,
  getAIConfig,
  parseJsonLenient,
  saveAIConfig
} from '../services/aiGenerator';

describe('aiGenerator dual-provider service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to claude-edge and supports switching to gemini in localStorage', () => {
    expect(getAIConfig().provider).toBe('claude-edge');
    expect(getActiveProviderLabel()).toBe('Claude (Servidor)');

    saveAIConfig({
      provider: 'gemini',
      geminiApiKey: 'AQ.test-key',
      geminiModel: 'gemini-3.1-pro-preview',
      claudeApiKey: '',
      claudeModel: 'claude-sonnet-4-6',
      useTrendsSearch: true,
      marketRegion: 'Colombia',
      expertPersona: DEFAULT_EXPERT_PERSONA
    });

    expect(getAIConfig().provider).toBe('gemini');
    expect(getActiveProviderLabel()).toBe('Gemini 3.1 Pro');
  });

  it('parses lenient JSON even with markdown code fences', () => {
    const res = parseJsonLenient<{ ok: boolean }>('```json\n{"ok":true}\n```');
    expect(res).toEqual({ ok: true });
  });

  it('runs 2-phase Gemini Google Search grounding + JSON script generation', async () => {
    saveAIConfig({
      provider: 'gemini',
      geminiApiKey: 'AQ.test-key',
      geminiModel: 'gemini-3.6-flash',
      claudeApiKey: '',
      claudeModel: 'claude-sonnet-4-6',
      useTrendsSearch: true,
      marketRegion: 'Colombia y Latinoamérica',
      expertPersona: DEFAULT_EXPERT_PERSONA
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // Phase 1: Google Search grounding
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
      // Phase 2: Strict JSON script generation
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
    saveAIConfig({
      provider: 'gemini',
      geminiApiKey: 'AQ.test-key',
      geminiModel: 'gemini-4-hydrogen',
      claudeApiKey: '',
      claudeModel: 'claude-sonnet-4-6',
      useTrendsSearch: false,
      marketRegion: 'Colombia',
      expertPersona: DEFAULT_EXPERT_PERSONA
    });

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

  it('generates structured ideas with Gemini without search when disabled', async () => {
    saveAIConfig({
      provider: 'gemini',
      geminiApiKey: 'AQ.test-key',
      geminiModel: 'gemini-3.6-flash',
      claudeApiKey: '',
      claudeModel: 'claude-sonnet-4-6',
      useTrendsSearch: false,
      marketRegion: 'Colombia',
      expertPersona: DEFAULT_EXPERT_PERSONA
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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
                          titulo: '3 errores al importar',
                          texto_base: 'Evita perder margen en tu primer envío.',
                          pilar: 'Importación',
                          formato: 'Hablando a cámara',
                          palabras_clave: 'IMPORTAR',
                          nivel_conciencia: 1
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
      tema: 'Importaciones',
      cantidad: 1,
      useTrendsOverride: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.ideas).toHaveLength(1);
    expect(res.ideas[0].titulo).toBe('3 errores al importar');
  });
});
