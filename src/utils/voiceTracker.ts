import type { ScriptBlock } from '../types/models';

export interface IndexedWord {
  raw: string;
  normalized: string;
  blockIndex: number;
  wordIndexInBlock: number;
  globalIndex: number;
}

export function normalizeSpanishWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]/gi, '');
}

export function tokenizeBlockWords(text: string): { raw: string; normalized: string }[] {
  return text
    .split(/\s+/)
    .map((raw) => ({
      raw,
      normalized: normalizeSpanishWord(raw)
    }))
    .filter((w) => w.raw.length > 0);
}

export function buildWordIndex(blocks: ScriptBlock[]): IndexedWord[] {
  const result: IndexedWord[] = [];
  let globalIndex = 0;

  blocks.forEach((block, blockIndex) => {
    const tokens = tokenizeBlockWords(block.text);
    tokens.forEach((t, wordIndexInBlock) => {
      result.push({
        raw: t.raw,
        normalized: t.normalized,
        blockIndex,
        wordIndexInBlock,
        globalIndex: globalIndex++
      });
    });
  });

  return result;
}

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para',
  'y', 'o', 'e', 'u', 'que', 'se', 'su', 'tu', 'mi', 'es', 'si', 'no'
]);

/**
 * Finds the furthest reasonable forward match in the script for the latest spoken transcript.
 */
export function findNextWordMatch(
  words: IndexedWord[],
  currentCursor: number,
  spokenTranscript: string,
  lookahead = 32
): number {
  if (words.length === 0) return currentCursor;

  const spokenTokens = spokenTranscript
    .split(/\s+/)
    .map(normalizeSpanishWord)
    .filter(Boolean);

  if (spokenTokens.length === 0) return currentCursor;

  const start = Math.max(0, currentCursor);
  const end = Math.min(words.length - 1, start + lookahead);

  // 1. Prefer 2-word consecutive match within lookahead
  if (spokenTokens.length >= 2) {
    const lastTwo = spokenTokens.slice(-2);
    for (let i = start; i < end; i++) {
      if (
        words[i].normalized === lastTwo[0] &&
        words[i + 1].normalized === lastTwo[1]
      ) {
        return i + 1;
      }
    }
  }

  // 2. Fallback: match the latest meaningful word (non-stopword or >= 4 chars)
  const recent = spokenTokens.slice(-3).reverse();
  for (const token of recent) {
    if (token.length < 3 || STOP_WORDS.has(token)) continue;
    for (let i = start; i <= end; i++) {
      if (words[i].normalized === token) {
        return i;
      }
    }
  }

  return currentCursor;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}
