import { describe, expect, it } from 'vitest';
import type { GuionResumen, IdeaConPuntaje, PalabraClave } from '../types/reellab';
import { evaluatePiezaChecklist } from '../utils/hookScorer';
import { findSimilarIdeas, suggestAwarenessLevel } from '../utils/ideaSimilarity';

describe('ideaSimilarity', () => {
  const sampleIdeas: IdeaConPuntaje[] = [
    {
      id: 1,
      numero: 1,
      titulo: '3 errores al importar desde China con poco dinero',
      texto_base: 'Muchos emprendedores pierden plata al pagar por fuera de la plataforma.',
      origen: 'manual',
      nino_5: true,
      gusta_50: true,
      ref_viral: false,
      mercado_viral: true,
      tendencia: false,
      controversia: false,
      calificada: true,
      estado: 'nueva',
      puntaje_idea: 6,
      puntaje_formato: 0,
      puntaje_total: 6,
      votos: 0,
      creado_en: '2026-01-01T00:00:00Z'
    }
  ];

  it('detects similar ideas despite accents and inflection', () => {
    const matches = findSimilarIdeas(
      'Errores al importar de China con poco presupuesto',
      'Pierden dinero al pagar fuera',
      sampleIdeas
    );
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(1);
  });

  it('suggests awareness level from 5-50 criteria or Herramientas pillar', () => {
    expect(suggestAwarenessLevel({ pilar: 'Herramientas' })).toBe(3);
    expect(suggestAwarenessLevel({ nino_5: true, gusta_50: true })).toBe(1);
    expect(suggestAwarenessLevel({ nino_5: true, gusta_50: false })).toBe(2);
    expect(suggestAwarenessLevel({ tendencia: true })).toBe(3);
  });
});

describe('hookScorer', () => {
  it('auto-evaluates hook length, visual presence, and concrete numbers', () => {
    const res = evaluatePiezaChecklist(
      {
        clase: 'gancho',
        texto: '3 errores al empacar tu pedido',
        visual: 'Caja abierta en primer plano',
        checklist: { cinco50: true }
      },
      [],
      []
    );
    const byKey = Object.fromEntries(res.items.map((i) => [i.key, i]));
    expect(byKey.corto.value).toBe(true);
    expect(byKey.corto.isAuto).toBe(true);
    expect(byKey.visual.value).toBe(true);
    expect(byKey.concreto.value).toBe(true);
    expect(byKey.cinco50.value).toBe(true);
    expect(res.yesCount).toBe(4);
  });

  it('auto-evaluates CTA keyword validity and objective match', () => {
    const guiones = [{ id: 10, objetivo: 'Venta' }] as GuionResumen[];
    const palabras = [{ id: 5, palabra: 'GUIA' }] as PalabraClave[];
    const res = evaluatePiezaChecklist(
      {
        clase: 'cta',
        texto: 'Comenta GUIA para enviarte el catálogo',
        objetivo: 'Venta',
        guion_id: 10,
        palabra_clave_id: 5,
        checklist: {}
      },
      guiones,
      palabras
    );
    const byKey = Object.fromEntries(res.items.map((i) => [i.key, i]));
    expect(byKey.corto.value).toBe(true);
    expect(byKey.objetivo.value).toBe(true);
    expect(byKey.palabra.value).toBe(true);
  });
});
