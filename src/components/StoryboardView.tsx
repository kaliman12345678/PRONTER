import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Play,
  Printer,
  X
} from 'lucide-react';
import {
  estimateWordStats,
  fetchBloquesByGuion,
  fetchGuiones,
  saveBloque,
  updateGuionEstado
} from '../db/reellabService';
import type { ScriptBlock } from '../types/models';
import type { BloqueStoryboard, GuionEstado, GuionResumen } from '../types/reellab';

interface Props {
  guion: GuionResumen;
  onClose: () => void;
  onEditGuion?: (guionId: number) => void;
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

const TIPO_LABELS: Record<string, string> = {
  gancho: 'Gancho',
  historia: 'Historia',
  moraleja: 'Moraleja',
  moraleja_cta: 'Moraleja / CTA',
  cta: 'CTA'
};

export function StoryboardView({
  guion: initialGuion,
  onClose,
  onEditGuion,
  onOpenTeleprompter,
  onNotify,
  onUpdated
}: Props) {
  const [allGuiones, setAllGuiones] = useState<GuionResumen[]>([initialGuion]);
  const [currentGuion, setCurrentGuion] = useState<GuionResumen>(initialGuion);
  const [bloquesMap, setBloquesMap] = useState<Record<number, BloqueStoryboard[]>>({});
  const [printAllMode, setPrintAllMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadGuionAndScenes = async (target: GuionResumen) => {
    setLoading(true);
    const [gList, scenes] = await Promise.all([
      fetchGuiones(),
      fetchBloquesByGuion(target.id)
    ]);
    if (gList.length > 0) setAllGuiones(gList);
    setBloquesMap((prev) => ({ ...prev, [target.id]: scenes }));
    setLoading(false);
  };

  useEffect(() => {
    setCurrentGuion(initialGuion);
    void loadGuionAndScenes(initialGuion);
  }, [initialGuion.id]);

  const currentIdx = allGuiones.findIndex((g) => g.id === currentGuion.id);
  const currentBloques = bloquesMap[currentGuion.id] || [];
  const stats = estimateWordStats(currentBloques);

  const switchGuion = async (next: GuionResumen) => {
    setCurrentGuion(next);
    if (!bloquesMap[next.id]) {
      setLoading(true);
      const scenes = await fetchBloquesByGuion(next.id);
      setBloquesMap((prev) => ({ ...prev, [next.id]: scenes }));
      setLoading(false);
    }
  };

  const handleToggleCheck = async (
    bloque: BloqueStoryboard,
    field: 'grabado' | 'exportado',
    value: boolean
  ) => {
    const updated = { ...bloque, [field]: value };
    setBloquesMap((prev) => ({
      ...prev,
      [bloque.guion_id]: (prev[bloque.guion_id] || []).map((b) =>
        b.id === bloque.id ? updated : b
      )
    }));
    try {
      await saveBloque(updated);
      await onUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const handleEstadoChange = async (next: GuionEstado) => {
    setCurrentGuion((prev) => ({ ...prev, estado: next }));
    await updateGuionEstado(currentGuion.id, next);
    await onUpdated();
    onNotify('Estado actualizado');
  };

  const handlePrintAll = async () => {
    setLoading(true);
    const entries = await Promise.all(
      allGuiones.map(async (g) => {
        const scenes = bloquesMap[g.id] || (await fetchBloquesByGuion(g.id));
        return [g.id, scenes] as const;
      })
    );
    const nextMap: Record<number, BloqueStoryboard[]> = { ...bloquesMap };
    for (const [id, scenes] of entries) {
      nextMap[id] = scenes;
    }
    setBloquesMap(nextMap);
    setPrintAllMode(true);
    setLoading(false);
    window.setTimeout(() => {
      window.print();
      setPrintAllMode(false);
    }, 250);
  };

  const handleOpenPrompter = () => {
    const tpBlocks: ScriptBlock[] = currentBloques
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
    onOpenTeleprompter(currentGuion.titulo, tpBlocks);
  };

  const sheetsToRender = printAllMode ? allGuiones : [currentGuion];

  return (
    <div className="storyboard-overlay">
      <div className="storyboard-container" style={{ maxWidth: 920 }}>
        {/* Top toolbar */}
        <div className="row-between no-print" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="icon-btn"
              disabled={currentIdx <= 0}
              title="Guion anterior"
              onClick={() => currentIdx > 0 && void switchGuion(allGuiones[currentIdx - 1])}
            >
              <ChevronLeft size={18} />
            </button>
            <select
              className="select"
              style={{ width: 'auto', maxWidth: 260, padding: '6px 10px' }}
              value={currentGuion.id}
              onChange={(e) => {
                const found = allGuiones.find((g) => g.id === Number(e.target.value));
                if (found) void switchGuion(found);
              }}
            >
              {allGuiones.map((g) => (
                <option key={g.id} value={g.id}>
                  Guion {g.numero ?? g.id} · {g.titulo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              disabled={currentIdx < 0 || currentIdx >= allGuiones.length - 1}
              title="Guion siguiente"
              onClick={() =>
                currentIdx >= 0 &&
                currentIdx < allGuiones.length - 1 &&
                void switchGuion(allGuiones[currentIdx + 1])
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenPrompter}>
              <Play size={15} fill="currentColor" />
              Teleprompter
            </button>
            {onEditGuion && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onEditGuion(currentGuion.id);
                }}
              >
                <Edit3 size={15} />
                Editar guion
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Imprimir / PDF
            </button>
            {allGuiones.length > 1 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void handlePrintAll()}
              >
                <FileText size={15} />
                PDF de todos
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status + missing Hook/CTA warning */}
        <div className="row-between no-print" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted" style={{ fontSize: '0.84rem' }}>
              {stats.words} pal. · ≈{stats.seconds}s (máx {currentGuion.duracion_max_s}s)
            </span>
            <select
              className="select"
              style={{ width: 'auto', padding: '4px 10px', fontSize: '0.82rem' }}
              value={currentGuion.estado}
              onChange={(e) => void handleEstadoChange(e.target.value as GuionEstado)}
            >
              {ESTADOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {(!currentGuion.gancho_id || !currentGuion.cta_id) && (
            <span className="badge notas">
              Falta elegir{' '}
              {[!currentGuion.gancho_id && 'gancho', !currentGuion.cta_id && 'CTA']
                .filter(Boolean)
                .join(' y ')}
            </span>
          )}
        </div>

        {loading ? (
          <p className="muted">Cargando storyboard...</p>
        ) : (
          sheetsToRender.map((sheetGuion) => {
            const scenes = bloquesMap[sheetGuion.id] || [];
            const sheetStats = estimateWordStats(scenes);

            return (
              <article key={sheetGuion.id} className="sb-sheet">
                <header className="sb-sheet-head">
                  <div className="row-between">
                    <span className="sb-sheet-tag">
                      STORYBOARD · GUION {sheetGuion.numero ?? sheetGuion.id} DE {allGuiones.length}
                    </span>
                    <span className="sb-sheet-dur">≈ {sheetStats.seconds} s</span>
                  </div>
                  <h2 style={{ margin: '4px 0 0', fontSize: '1.2rem' }}>{sheetGuion.titulo}</h2>
                  <div className="sb-sheet-meta">
                    <span>Pilar: {sheetGuion.pilar || '—'}</span>
                    <span>Temática: {sheetGuion.tematica || '—'}</span>
                    <span>Objetivo: {sheetGuion.objetivo || '—'}</span>
                    <span>Formato: {sheetGuion.formato_grabacion || '—'}</span>
                  </div>
                </header>

                <div style={{ overflowX: 'auto' }}>
                  <table className="sb-table">
                    <thead>
                      <tr>
                        <th style={{ width: '16%' }}># / Tiempo</th>
                        <th style={{ width: '24%' }}>Sketch</th>
                        <th style={{ width: '32%' }}>Diálogo / voz en cámara</th>
                        <th style={{ width: '28%' }}>Plano / Cámara / Edición</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenes.map((b, i) => {
                        const screenLines = (b.texto_pantalla || '')
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean);

                        return (
                          <tr key={b.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>
                                {String(i + 1).padStart(2, '0')} · {TIPO_LABELS[b.tipo] || b.tipo}
                              </div>
                              <div className="muted" style={{ fontSize: '0.78rem' }}>
                                {b.inicio_s ?? 0}–{b.fin_s ?? 0} s
                              </div>
                              <div className="no-print" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="row" style={{ gap: 4, fontSize: '0.76rem', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={b.grabado}
                                    onChange={(e) =>
                                      void handleToggleCheck(b, 'grabado', e.target.checked)
                                    }
                                  />
                                  Grabado
                                </label>
                                <label className="row" style={{ gap: 4, fontSize: '0.76rem', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={b.exportado}
                                    onChange={(e) =>
                                      void handleToggleCheck(b, 'exportado', e.target.checked)
                                    }
                                  />
                                  Exportado
                                </label>
                              </div>
                            </td>
                            <td>
                              {b.sketch_url ? (
                                <img
                                  src={b.sketch_url}
                                  alt={`Escena ${i + 1}`}
                                  style={{
                                    width: '100%',
                                    maxHeight: 110,
                                    objectFit: 'contain',
                                    background: '#fff',
                                    borderRadius: 6
                                  }}
                                />
                              ) : null}
                              {b.sketch_texto ? (
                                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                  {b.sketch_texto}
                                </div>
                              ) : !b.sketch_url ? (
                                <span className="muted" style={{ fontSize: '0.78rem' }}>
                                  Sin sketch
                                </span>
                              ) : null}
                            </td>
                            <td style={{ whiteSpace: 'pre-wrap' }}>
                              {b.dialogo ? `“${b.dialogo}”` : <i className="muted">Sin diálogo</i>}
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>
                              <div>
                                <strong>Plano:</strong> {b.plano || '—'}
                              </div>
                              <div>
                                <strong>Cámara:</strong> {b.camara || '—'}
                              </div>
                              {(b.edicion || []).length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <strong>Edición:</strong>
                                  <ul style={{ margin: '2px 0', paddingLeft: 16 }}>
                                    {b.edicion.map((ed, ei) => (
                                      <li key={ei}>{ed}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {screenLines.length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <strong>En pantalla:</strong>
                                  <ul style={{ margin: '2px 0', paddingLeft: 16 }}>
                                    {screenLines.map((ln, li) => (
                                      <li key={li}>{ln}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <footer className="sb-sheet-foot">
                  <span>
                    <strong>Locación:</strong> {sheetGuion.locacion || '—'}
                  </span>
                  <span>
                    <strong>Iluminación:</strong> {sheetGuion.iluminacion || '—'}
                  </span>
                  <span>
                    <strong>Tono:</strong> {sheetGuion.tono || '—'}
                  </span>
                </footer>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
