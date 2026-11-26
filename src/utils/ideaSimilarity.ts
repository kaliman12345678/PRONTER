import type { IdeaConPuntaje } from '../types/reellab';

const STOP_WORDS = new Set(
  'para como cuando porque pero este esta esto estos estas tienes tiene sobre desde hasta donde entre todo toda todos todas solo sola cada antes despues mismo misma otra otro otros nada algo hace hacer haces muy mas menos sino ellos ellas nosotros usted tu tus mis sus que con los las del una uno unos unas por sin hay son ser fue era'.split(
    ' '
  )
);

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenizeRoots(value: string): Set<string> {
  const normalized = stripAccents((value || '').toLowerCase()).replace(/[^a-z0-9ñ ]/g, ' ');
  return new Set(
    normalized
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .map((w) => w.slice(0, 4))
  );
}

/**
 * Finds up to 3 existing ideas whose title or opening text shares meaningful word roots.
 */
export function findSimilarIdeas(
  titulo: string,
  textoBase: string | null | undefined,
  allIdeas: IdeaConPuntaje[],
  excludeId?: number | null
): IdeaConPuntaje[] {
  const titleTokens = tokenizeRoots(titulo);
  if (titleTokens.size === 0) return [];

  const first40 = (textoBase || '').split(/\s+/).slice(0, 40).join(' ');
  const fullTokens = tokenizeRoots(`${titulo} ${first40}`);

  return allIdeas
    .filter((idea) => idea.id !== excludeId)
    .map((idea) => {
      const candTitleTokens = tokenizeRoots(idea.titulo);
      const candFirst40 = (idea.texto_base || '').split(/\s+/).slice(0, 40).join(' ');
      const candFullTokens = tokenizeRoots(`${idea.titulo} ${candFirst40}`);

      let commonTitle = 0;
      for (const tok of titleTokens) {
        if (candTitleTokens.has(tok)) commonTitle++;
      }

      let commonFull = 0;
      for (const tok of fullTokens) {
        if (candFullTokens.has(tok)) commonFull++;
      }

      const titleScore =
        commonTitle >= 2
          ? commonTitle / Math.max(1, Math.min(titleTokens.size, candTitleTokens.size))
          : 0;

      const unionSize = new Set([...fullTokens, ...candFullTokens]).size;
      const fullScore = commonFull >= 3 ? commonFull / Math.max(1, unionSize) : 0;

      return { idea, score: Math.max(titleScore, fullScore * 1.6) };
    })
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.idea);
}

/**
 * Suggests an awareness level (0-4) from the virality calculator criteria and pillar.
 */
export function suggestAwarenessLevel(input: {
  pilar?: string | null;
  nino_5?: boolean;
  gusta_50?: boolean;
  ref_viral?: boolean;
  mercado_viral?: boolean;
  tendencia?: boolean;
  controversia?: boolean;
}): number | null {
  if (input.pilar === 'Herramientas') return 3;
  const anyMarked = Boolean(
    input.nino_5 ||
      input.gusta_50 ||
      input.ref_viral ||
      input.mercado_viral ||
      input.tendencia ||
      input.controversia
  );
  if (!anyMarked) return null;
  const base = (input.nino_5 ? 1 : 0) + (input.gusta_50 ? 1 : 0);
  return base === 2 ? 1 : base === 1 ? 2 : 3;
}
