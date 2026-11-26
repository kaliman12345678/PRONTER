import type { GuionResumen, PalabraClave, PiezaResumen } from '../types/reellab';
import { stripAccents } from './ideaSimilarity';

export interface ScorerCriterion {
  key: string;
  label: string;
  auto?: (ctx: {
    texto: string;
    visual?: string | null;
    objetivo?: string | null;
    guion?: GuionResumen;
    palabra?: PalabraClave;
  }) => boolean | null;
}

export function countWords(text: string | null | undefined): number {
  const clean = (text || '').trim();
  return clean ? clean.split(/\s+/).length : 0;
}

export const HOOK_CRITERIA: ScorerCriterion[] = [
  {
    key: 'corto',
    label: '¿Se entiende en menos de 3 s? (12 palabras o menos)',
    auto: ({ texto }) => countWords(texto) <= 12
  },
  {
    key: 'cinco50',
    label: '¿Pasa el 5-50? (lo entiende un niño de 5 años y le gusta a 50 de 100)'
  },
  {
    key: 'curiosidad',
    label: '¿Abre una curiosidad sin revelar la respuesta?'
  },
  {
    key: 'visual',
    label: '¿Tiene algo visual además de lo que se dice?',
    auto: ({ visual }) => Boolean((visual || '').trim())
  },
  {
    key: 'concreto',
    label: '¿Es concreto? (número, tiempo o resultado)',
    auto: ({ texto }) =>
      /\d|\b(uno|dos|tres|cuatro|cinco|seis|siete|diez|cien|mil)\b/i.test(texto || '')
  },
  {
    key: 'resultado',
    label: '¿Habla del resultado o del dolor, no de la herramienta?'
  },
  {
    key: 'verdad',
    label: '¿Es verdad y lo podemos respaldar?'
  }
];

export const CTA_CRITERIA: ScorerCriterion[] = [
  {
    key: 'una',
    label: '¿Pide una sola acción?'
  },
  {
    key: 'objetivo',
    label: '¿Coincide con el objetivo del guion?',
    auto: ({ guion, objetivo }) => {
      if (!guion) return null;
      if (!guion.objetivo || !objetivo) return true;
      return guion.objetivo === objetivo;
    }
  },
  {
    key: 'razon',
    label: '¿Da una razón de peso o algo concreto a cambio? («Sígueme para más» no cuenta)'
  },
  {
    key: 'corto',
    label: '¿Tiene 10 palabras o menos?',
    auto: ({ texto }) => countWords(texto) <= 10
  },
  {
    key: 'palabra',
    label: 'Si usa palabra clave: ¿es corta, sin tildes y no se confunde?',
    auto: ({ palabra }) => {
      if (!palabra) return null;
      return (
        palabra.palabra.length <= 12 &&
        palabra.palabra === stripAccents(palabra.palabra) &&
        !/\s/.test(palabra.palabra)
      );
    }
  }
];

export interface EvaluatedCriterion {
  key: string;
  label: string;
  value: boolean | null;
  isAuto: boolean;
}

export function evaluatePiezaChecklist(
  pieza: Pick<
    PiezaResumen,
    'clase' | 'texto' | 'visual' | 'objetivo' | 'guion_id' | 'palabra_clave_id' | 'checklist'
  >,
  guiones: GuionResumen[],
  palabras: PalabraClave[]
): {
  items: EvaluatedCriterion[];
  yesCount: number;
  totalCount: number;
} {
  const criteria = pieza.clase === 'gancho' ? HOOK_CRITERIA : CTA_CRITERIA;
  const guion = guiones.find((g) => g.id === Number(pieza.guion_id));
  const palabra = palabras.find((p) => p.id === Number(pieza.palabra_clave_id));

  const items: EvaluatedCriterion[] = criteria.map((c) => {
    const autoVal = c.auto
      ? c.auto({
          texto: pieza.texto,
          visual: pieza.visual,
          objetivo: pieza.objetivo,
          guion,
          palabra
        })
      : null;

    return {
      key: c.key,
      label: c.label,
      value: autoVal !== null ? autoVal : pieza.checklist?.[c.key] ?? null,
      isAuto: autoVal !== null
    };
  });

  const yesCount = items.filter((item) => item.value === true).length;
  return { items, yesCount, totalCount: criteria.length };
}
