import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X
} from 'lucide-react';
import type { ScriptBlock, TeleprompterSettings } from '../types/models';
import {
  loadTeleprompterSettings,
  saveTeleprompterSettings
} from '../utils/preferences';
import {
  buildWordIndex,
  findNextWordMatch,
  getSpeechRecognitionConstructor,
  tokenizeBlockWords,
  type SpeechRecognitionLike
} from '../utils/voiceTracker';

interface Props {
  documentTitle: string;
  blocks: ScriptBlock[];
  onExit: () => void;
}

export function TeleprompterPage({ documentTitle, blocks, onExit }: Props) {
  const [settings, setSettings] = useState<TeleprompterSettings>(() =>
    loadTeleprompterSettings()
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  // Voice tracking state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [matchedWordIndex, setMatchedWordIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const lastFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceEnabledRef = useRef(false);
  const matchedWordRef = useRef(0);

  const indexedWords = useMemo(() => buildWordIndex(blocks), [blocks]);

  const blockStartOffsets = useMemo(() => {
    const offsets: number[] = [];
    let count = 0;
    for (const block of blocks) {
      offsets.push(count);
      count += tokenizeBlockWords(block.text).length;
    }
    return offsets;
  }, [blocks]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    matchedWordRef.current = matchedWordIndex;
  }, [matchedWordIndex]);

  useEffect(() => {
    saveTeleprompterSettings(settings);
  }, [settings]);

  // Smooth auto-scroll loop
  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;
      return;
    }

    let rafId = 0;
    const step = (timestamp: number) => {
      if (lastFrameRef.current !== null && scrollRef.current) {
        const dt = (timestamp - lastFrameRef.current) / 1000;
        const pixelsPerSecond = 18 + settings.speed * 14;
        scrollRef.current.scrollTop += pixelsPerSecond * dt;

        // Pause automatically if we reached the bottom
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setIsPlaying(false);
          return;
        }
      }
      lastFrameRef.current = timestamp;
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, settings.speed]);

  // Speech recognition loop for "Seguir mi voz"
  useEffect(() => {
    if (!voiceEnabled) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechCtor = getSpeechRecognitionConstructor();
    if (!SpeechCtor) {
      setVoiceEnabled(false);
      setVoiceNotice('Tu navegador no soporta seguimiento por voz. Usa Leer.');
      return;
    }

    const recognition = new SpeechCtor();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += ` ${event.results[i][0].transcript}`;
      }
      const nextIdx = findNextWordMatch(
        indexedWords,
        matchedWordRef.current,
        transcript
      );
      if (nextIdx > matchedWordRef.current) {
        matchedWordRef.current = nextIdx;
        setMatchedWordIndex(nextIdx);
        const wordEntry = indexedWords[nextIdx];
        if (wordEntry) {
          setActiveIndex(wordEntry.blockIndex);
        }
        const wordEl = wordRefs.current[nextIdx];
        if (wordEl && scrollRef.current) {
          const targetTop = Math.max(0, wordEl.offsetTop - 72);
          scrollRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setVoiceNotice('Micrófono no disponible o bloqueado. Usa Leer.');
        setVoiceEnabled(false);
      } else if (event.error === 'network') {
        setVoiceNotice('El seguimiento por voz requiere conexión en este navegador.');
        setVoiceEnabled(false);
      }
    };

    recognition.onend = () => {
      if (voiceEnabledRef.current) {
        try {
          recognition.start();
        } catch {
          // ignore restart errors
        }
      }
    };

    try {
      recognition.start();
      setVoiceNotice('Escuchando tu voz...');
    } catch {
      setVoiceEnabled(false);
      setVoiceNotice('No se pudo iniciar el micrófono.');
    }

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [voiceEnabled, indexedWords]);

  const toggleVoiceMode = () => {
    setVoiceNotice(null);
    if (!voiceEnabled) {
      setIsPlaying(false);
      setVoiceEnabled(true);
    } else {
      setVoiceEnabled(false);
    }
  };

  const jumpToBlock = (index: number) => {
    const clamped = Math.max(0, Math.min(blocks.length - 1, index));
    setActiveIndex(clamped);
    const startWord = blockStartOffsets[clamped] ?? 0;
    matchedWordRef.current = startWord;
    setMatchedWordIndex(startWord);
    const el = blockRefs.current[clamped];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: Math.max(0, el.offsetTop - 28),
        behavior: 'smooth'
      });
    }
  };

  const resetToTop = () => {
    setIsPlaying(false);
    setActiveIndex(0);
    matchedWordRef.current = 0;
    setMatchedWordIndex(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const adjustFontSize = (delta: number) => {
    setSettings((prev) => ({
      ...prev,
      fontSize: Math.min(64, Math.max(20, prev.fontSize + delta))
    }));
  };

  const adjustSpeed = (delta: number) => {
    setSettings((prev) => ({
      ...prev,
      speed: Math.min(10, Math.max(1, prev.speed + delta))
    }));
  };

  return (
    <div className="teleprompter-screen">
      {/* Reading guide near front camera */}
      <div className="teleprompter-camera-guide" aria-hidden="true" />

      {showControls && (
        <div className="teleprompter-controls-top">
          <button
            type="button"
            className="tp-pill-btn"
            onClick={onExit}
            aria-label="Salir del teleprompter"
          >
            <X size={18} />
            Salir
          </button>

          <span
            style={{
              fontSize: '0.82rem',
              color: '#94a3b8',
              background: 'rgba(15,23,42,0.8)',
              padding: '6px 12px',
              borderRadius: 999,
              maxWidth: '45%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {documentTitle}
          </span>

          <button
            type="button"
            className={`tp-pill-btn ${settings.showCues ? 'active' : ''}`}
            onClick={() =>
              setSettings((prev) => ({ ...prev, showCues: !prev.showCues }))
            }
          >
            {settings.showCues ? <Eye size={17} /> : <EyeOff size={17} />}
            Indicaciones
          </button>
        </div>
      )}

      {/* Tapping reading area toggles controls */}
      <div
        ref={scrollRef}
        className="teleprompter-scroll"
        onClick={() => setShowControls((v) => !v)}
        data-testid="teleprompter-reading-area"
      >
        <div className="teleprompter-content">
          {blocks.map((block, idx) => {
            const blockOffset = blockStartOffsets[idx] ?? 0;
            const tokens = tokenizeBlockWords(block.text);
            return (
              <div
                key={block.id}
                ref={(el) => {
                  blockRefs.current[idx] = el;
                }}
                data-testid={`teleprompter-block-${idx}`}
              >
                <div className="teleprompter-block-label">
                  {idx + 1}/{blocks.length} · {block.title}
                </div>
                <p
                  className="teleprompter-block-text"
                  style={{ fontSize: `${settings.fontSize}px` }}
                >
                  {voiceEnabled
                    ? tokens.map((token, wordIdx) => {
                        const globalIdx = blockOffset + wordIdx;
                        const isPassed = globalIdx < matchedWordIndex;
                        const isCurrent = globalIdx === matchedWordIndex;
                        return (
                          <span
                            key={globalIdx}
                            ref={(el) => {
                              wordRefs.current[globalIdx] = el;
                            }}
                            style={{
                              color: isPassed ? '#64748b' : '#ffffff',
                              textDecoration: isCurrent ? 'underline' : 'none',
                              textDecorationColor: '#38bdf8',
                              textUnderlineOffset: '6px'
                            }}
                          >
                            {token.raw}{' '}
                          </span>
                        );
                      })
                    : block.text}
                </p>
                {settings.showCues && block.cues && (
                  <div className="teleprompter-block-cues">{block.cues}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showControls && (
        <div
          className="teleprompter-controls-bottom"
          onClick={(e) => e.stopPropagation()}
        >
          {voiceNotice && (
            <div
              style={{
                fontSize: '0.8rem',
                textAlign: 'center',
                color: voiceEnabled ? '#38bdf8' : '#fde68a'
              }}
            >
              {voiceNotice}
            </div>
          )}

          <div className="row-between">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={activeIndex <= 0}
              onClick={() => jumpToBlock(activeIndex - 1)}
              aria-label="Bloque anterior"
            >
              <ChevronLeft size={18} />
              Anterior
            </button>

            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 112 }}
              onClick={() => {
                if (!isPlaying) setVoiceEnabled(false);
                setIsPlaying((p) => !p);
              }}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
              {isPlaying ? 'Pausar' : 'Leer'}
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={activeIndex >= blocks.length - 1}
              onClick={() => jumpToBlock(activeIndex + 1)}
              aria-label="Siguiente bloque"
            >
              Siguiente
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={`tp-pill-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={toggleVoiceMode}
              aria-label="Seguir mi voz"
            >
              {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
              {voiceEnabled ? 'Voz activa' : 'Seguir mi voz'}
            </button>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Vel: {settings.speed}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Bajar velocidad"
                onClick={() => adjustSpeed(-1)}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Subir velocidad"
                onClick={() => adjustSpeed(1)}
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="row" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Texto: {settings.fontSize}px
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Reducir texto"
                onClick={() => adjustFontSize(-4)}
              >
                A-
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Aumentar texto"
                onClick={() => adjustFontSize(4)}
              >
                A+
              </button>
            </div>

            <button
              type="button"
              className="icon-btn"
              aria-label="Reiniciar arriba"
              title="Volver al inicio"
              onClick={resetToTop}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
