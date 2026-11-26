import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ImagePlus,
  Play,
  Plus,
  Printer,
  Save,
  Trash2,
  X
} from 'lucide-react';
import {
  addBloqueToGuion,
  deleteBloque,
  estimateWordStats,
  fetchBloquesByGuion,
  saveBloque,
  updateGuionEstado,
  uploadSketchImage
} from '../db/reellabService';
import type { ScriptBlock } from '../types/models';
import type {
  BloqueStoryboard,
  BloqueTipo,
  GuionEstado,
  GuionResumen
} from '../types/reellab';
import { copyToClipboard } from '../utils/clipboard';

interface Props {
  guion: GuionResumen;
  onClose: () => void;
  onOpenTeleprompter: (title: string, blocks: ScriptBlock[]) => void;
  onNotify: (msg: string) => void;
  onUpdated: () => Promise<void>;
}

const ESTADOS: { value: GuionEstado; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'guion_listo', label: 'Guion listo' },
  { value: 'grabado', label: 'Grabado' },
  { value: 'editado', label: 'Editado' },
  { value: 'publicado', label: 'Publicado' }
];

const BLOQUE_TIPOS: { value: BloqueTipo; label: string }[] = [
  { value: 'gancho', label: 'Gancho' },
  { value: 'historia', label: 'Historia' },
  { value: 'moraleja', label: 'Moraleja' },
  { value: 'moraleja_cta', label: 'Moraleja + CTA' },
  { value: 'cta', label: 'CTA' }
];

export function StoryboardPrintModal({
  guion,
  onClose,
  onOpenTeleprompter,
  onNotify,
  onUpdated
}: Props) {
  const [bloques, setBloques] = useState<BloqueStoryboard[]>([]);
  const [estado, setEstado] = useState<GuionEstado>(guion.estado);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadBloques = async () => {
    setLoading(true);
    const list = await fetchBloquesByGuion(guion.id);
    setBloques(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadBloques();
  }, [guion.id]);

  const stats = estimateWordStats(bloques);

  const handleEstadoChange = async (next: GuionEstado) => {
    setEstado(next);
    await updateGuionEstado(guion.id, next);
    await onUpdated();
    onNotify('Estado actualizado');
  };

  const handleUpdateLocal = (id: number, patch: Partial<BloqueStoryboard>) => {
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const handleSaveBloque = async (b: BloqueStoryboard) => {
    setSavingId(b.id);
    try {
      await saveBloque(b);
      await onUpdated();
      onNotify('Escena guardada');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al guardar escena');
    } finally {
      setSavingId(null);
    }
  };

  const handleAddBloque = async () => {
    const nextOrden = bloques.length > 0 ? Math.max(...bloques.map((b) => b.orden)) + 1 : 1;
    const created = await addBloqueToGuion(guion.id, nextOrden, 'historia');
    setBloques((prev) => [...prev, created]);
    await onUpdated();
  };

  const handleDeleteBloque = async (id: number) => {
    await deleteBloque(id);
    setBloques((prev) => prev.filter((b) => b.id !== id));
    await onUpdated();
    onNotify('Escena eliminada');
  };

  const handleUploadSketch = async (bloque: BloqueStoryboard, file: File) => {
    try {
      const url = await uploadSketchImage(guion.id, file);
      const updated = { ...bloque, sketch_url: url };
      handleUpdateLocal(bloque.id, { sketch_url: url });
      await saveBloque(updated);
      onNotify('Sketch subido');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo subir el sketch');
    }
  };

  const handleOpenPrompter = () => {
    const tpBlocks: ScriptBlock[] = bloques
      .filter((b) => b.dialogo.trim() || b.texto_pantalla.trim())
      .map((b) => ({
        id: `sb-${b.id}`,
        title: `${b.inicio_s ?? 0}–${b.fin_s ?? 0}s · ${b.tipo.toUpperCase()}`,
        text: b.dialogo.trim() || b.texto_pantalla.trim(),
        cues: [
          b.plano ? `Plano: ${b.plano}` : '',
          b.camara ? `Cámara: ${b.camara}` : '',
          b.texto_pantalla ? `Pantalla: ${b.texto_pantalla}` : '',
          b.sketch_texto ? `Nota: ${b.sketch_texto}` : ''
        ]
          .filter(Boolean)
          .join(' · ')
      }));

    if (tpBlocks.length === 0) {
      onNotify('Escribe diálogo en al menos una escena primero');
      return;
    }
    onOpenTeleprompter(guion.titulo, tpBlocks);
  };

  return (
    <div className="storyboard-overlay">
      <div className="storyboard-container">
        <div className="row-between no-print" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{guion.titulo}</h2>
            <span className="muted">
              {stats.words} palabras · ~{stats.seconds} s estimados (máx {guion.duracion_max_s} s)
            </span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenPrompter}>
              <Play size={15} fill="currentColor" />
              Teleprompter
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Imprimir / PDF
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="row-between no-print" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <label htmlFor="guion-estado-sel" className="muted">
              Estado:
            </label>
            <select
              id="guion-estado-sel"
              className="select"
              style={{ width: 'auto', padding: '6px 12px' }}
              value={estado}
              onChange={(e) => void handleEstadoChange(e.target.value as GuionEstado)}
            >
              {ESTADOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {stats.seconds > guion.duracion_max_s && (
            <span className="badge notas">
              Supera los {guion.duracion_max_s} s recomendados
            </span>
          )}
        </div>

        {/* Printable header (visible in print) */}
        <div className="print-only" style={{ marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: '14pt' }}>{guion.titulo}</h1>
          <div style={{ fontSize: '9pt', color: '#444' }}>
            {guion.pilar || ''} · {guion.formato || ''} · {stats.words} palabras (~{stats.seconds} s)
          </div>
        </div>

        {loading ? (
          <p className="muted">Cargando escenas...</p>
        ) : (
          <div className="storyboard-grid">
            {bloques.map((b, idx) => (
              <div key={b.id} className="storyboard-card">
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge">Escena {idx + 1}</span>
                    <select
                      className="select no-print"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}
                      value={b.tipo}
                      onChange={(e) =>
                        handleUpdateLocal(b.id, { tipo: e.target.value as BloqueTipo })
                      }
                    >
                      {BLOQUE_TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <span className="print-only" style={{ fontWeight: 700, fontSize: '9pt' }}>
                      {b.tipo.toUpperCase()} ({b.inicio_s ?? 0}–{b.fin_s ?? 0}s)
                    </span>
                  </div>

                  <div className="row no-print" style={{ gap: 6 }}>
                    <label className="row" style={{ gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={b.grabado}
                        onChange={(e) => {
                          const next = { ...b, grabado: e.target.checked };
                          handleUpdateLocal(b.id, { grabado: e.target.checked });
                          void saveBloque(next);
                        }}
                      />
                      Grabado
                    </label>
                    <label className="row" style={{ gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={b.exportado}
                        onChange={(e) => {
                          const next = { ...b, exportado: e.target.checked };
                          handleUpdateLocal(b.id, { exportado: e.target.checked });
                          void saveBloque(next);
                        }}
                      />
                      Exportado
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={savingId === b.id}
                      onClick={() => void handleSaveBloque(b)}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleDeleteBloque(b.id)}
                      aria-label="Eliminar escena"
                    >
                      <Trash2 size={15} color="#f87171" />
                    </button>
                  </div>
                </div>

                <div className="storyboard-row">
                  <div className="storyboard-sketch-box">
                    {b.sketch_url ? (
                      <img src={b.sketch_url} alt={`Sketch ${idx + 1}`} />
                    ) : (
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        Sin imagen de sketch
                      </span>
                    )}
                    {b.sketch_texto && (
                      <div style={{ fontSize: '0.8rem', marginTop: 4 }}>{b.sketch_texto}</div>
                    )}
                    <div className="row no-print" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                        <ImagePlus size={14} />
                        Sketch
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadSketch(b, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {b.sketch_prompt && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            void copyToClipboard(b.sketch_prompt || '').then((ok) =>
                              onNotify(ok ? 'Prompt copiado' : 'No se pudo copiar')
                            )
                          }
                        >
                          <Copy size={13} />
                          Copiar prompt
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="row no-print" style={{ gap: 6 }}>
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        style={{ width: 78, padding: '6px 8px' }}
                        value={b.inicio_s ?? ''}
                        placeholder="Inicio"
                        onChange={(e) =>
                          handleUpdateLocal(b.id, {
                            inicio_s: e.target.value === '' ? null : Number(e.target.value)
                          })
                        }
                      />
                      <span className="muted">a</span>
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        style={{ width: 78, padding: '6px 8px' }}
                        value={b.fin_s ?? ''}
                        placeholder="Fin (s)"
                        onChange={(e) =>
                          handleUpdateLocal(b.id, {
                            fin_s: e.target.value === '' ? null : Number(e.target.value)
                          })
                        }
                      />
                    </div>

                    <textarea
                      className="textarea no-print"
                      rows={2}
                      value={b.dialogo}
                      placeholder="Diálogo para leer..."
                      onChange={(e) => handleUpdateLocal(b.id, { dialogo: e.target.value })}
                    />
                    <div className="print-only" style={{ fontSize: '9pt' }}>
                      <strong>Diálogo:</strong> {b.dialogo}
                    </div>

                    <input
                      className="input no-print"
                      style={{ padding: '6px 10px', fontSize: '0.88rem' }}
                      value={b.texto_pantalla}
                      placeholder="Texto en pantalla..."
                      onChange={(e) =>
                        handleUpdateLocal(b.id, { texto_pantalla: e.target.value })
                      }
                    />
                    {b.texto_pantalla && (
                      <div className="print-only" style={{ fontSize: '8.5pt', color: '#333' }}>
                        <strong>Pantalla:</strong> {b.texto_pantalla}
                      </div>
                    )}

                    <div className="row no-print" style={{ gap: 6 }}>
                      <input
                        className="input"
                        style={{ padding: '6px 10px', fontSize: '0.84rem' }}
                        value={b.plano || ''}
                        placeholder="Plano"
                        onChange={(e) => handleUpdateLocal(b.id, { plano: e.target.value })}
                      />
                      <input
                        className="input"
                        style={{ padding: '6px 10px', fontSize: '0.84rem' }}
                        value={b.camara || ''}
                        placeholder="Cámara"
                        onChange={(e) => handleUpdateLocal(b.id, { camara: e.target.value })}
                      />
                    </div>

                    <input
                      className="input no-print"
                      style={{ padding: '6px 10px', fontSize: '0.84rem' }}
                      value={b.sketch_texto || ''}
                      placeholder="Nota / texto libre en espacio de sketch..."
                      onChange={(e) =>
                        handleUpdateLocal(b.id, { sketch_texto: e.target.value })
                      }
                    />

                    <div className="print-only" style={{ fontSize: '8pt' }}>
                      [{b.grabado ? '✓' : ' '} Grabado] [{b.exportado ? '✓' : ' '} Exportado] ·{' '}
                      {b.plano || ''} · {b.camara || ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-block no-print"
          onClick={() => void handleAddBloque()}
        >
          <Plus size={17} />
          Agregar escena al storyboard
        </button>

        <div className="print-only" style={{ fontSize: '8pt', textAlign: 'right', color: '#666' }}>
          <Check size={10} /> Guion en Pantalla · ReelLab Storyboard
        </div>
      </div>
    </div>
  );
}
