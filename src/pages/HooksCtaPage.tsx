import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Hash, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import {
  assignPiezaToGuion,
  createPalabraClave,
  createPiezaGanchoCta,
  deletePalabraClave,
  deletePiezaGanchoCta,
  fetchGanchoTipos,
  fetchGuiones,
  fetchPalabrasClave,
  fetchPiezasGanchoCta,
  savePiezaVoto,
  togglePalabraClaveActiva,
  updatePiezaGanchoCta
} from '../db/reellabService';
import type {
  GanchoTipo,
  GuionResumen,
  PalabraClave,
  PiezaResumen,
  Votante
} from '../types/reellab';
import { copyToClipboard } from '../utils/clipboard';
import { countWords, evaluatePiezaChecklist } from '../utils/hookScorer';

interface Props {
  activeUser: Votante | null;
  schemaMissing: boolean;
  onNotify: (msg: string) => void;
}

const OBJETIVOS_CTA = ['Seguidores', 'Guardados', 'Comentarios', 'Venta', 'Viralidad'];
const HERRAMIENTAS_RESPONDE = [
  'Cloxia',
  'Waichat',
  'Logigho',
  'MarketLab',
  'KORVEX',
  'WCL',
  'People Flow'
];

const ESTADOS_PIEZA: Record<PiezaResumen['estado'], string> = {
  en_uso: 'En uso',
  potencial: 'Con potencial',
  usado: 'Usado',
  descartado: 'Descartado'
};

export function HooksCtaPage({ activeUser, schemaMissing, onNotify }: Props) {
  const [tab, setTab] = useState<'tipos' | 'banco' | 'palabras'>('tipos');
  const [tipos, setTipos] = useState<GanchoTipo[]>([]);
  const [piezas, setPiezas] = useState<PiezaResumen[]>([]);
  const [palabras, setPalabras] = useState<PalabraClave[]>([]);
  const [guiones, setGuiones] = useState<GuionResumen[]>([]);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');

  // Banco filters
  const [bancoSearch, setBancoSearch] = useState('');
  const [bancoClase, setBancoClase] = useState<'all' | 'gancho' | 'cta'>('all');
  const [bancoEstado, setBancoEstado] = useState<string>('all');

  // Pieza modal (create/edit + calificador)
  const [editingPiezaId, setEditingPiezaId] = useState<number | null>(null);
  const [showPiezaModal, setShowPiezaModal] = useState(false);
  const [clase, setClase] = useState<'gancho' | 'cta'>('gancho');
  const [texto, setTexto] = useState('');
  const [visual, setVisual] = useState('');
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);
  const [objetivo, setObjetivo] = useState('');
  const [palabraClaveId, setPalabraClaveId] = useState<number | null>(null);
  const [guionId, setGuionId] = useState<number | null>(null);
  const [estadoPieza, setEstadoPieza] = useState<PiezaResumen['estado']>('potencial');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [resultado, setResultado] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [copyToGuionScene, setCopyToGuionScene] = useState(true);

  // Palabra clave form
  const [newWord, setNewWord] = useState('');
  const [newVariantes, setNewVariantes] = useState('');
  const [newRecurso, setNewRecurso] = useState('');
  const [newHerramienta, setNewHerramienta] = useState('');

  const loadAll = async () => {
    const [tList, pList, kwList, gList] = await Promise.all([
      fetchGanchoTipos(),
      fetchPiezasGanchoCta(),
      fetchPalabrasClave(),
      fetchGuiones()
    ]);
    setTipos(tList);
    setPiezas(pList);
    setPalabras(kwList);
    setGuiones(gList);
  };

  useEffect(() => {
    if (!schemaMissing) {
      void loadAll();
    }
  }, [schemaMissing]);

  const families = useMemo(
    () => Array.from(new Set(tipos.map((t) => t.familia))),
    [tipos]
  );

  const filteredTipos = useMemo(() => {
    return tipos.filter((t) => {
      if (familyFilter !== 'all' && t.familia !== familyFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return `${t.nombre} ${t.familia} ${t.plantilla} ${t.ejemplo}`
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
  }, [tipos, familyFilter, search]);

  const filteredPiezas = useMemo(() => {
    return piezas.filter((p) => {
      if (bancoClase !== 'all' && p.clase !== bancoClase) return false;
      if (bancoEstado !== 'all' && p.estado !== bancoEstado) return false;
      if (bancoSearch.trim()) {
        const q = bancoSearch.toLowerCase();
        return `${p.texto} ${p.visual || ''} ${p.nota || ''} ${p.tipo_nombre || ''}`
          .toLowerCase()
          .includes(q);
      }
      return true;
    });
  }, [piezas, bancoClase, bancoEstado, bancoSearch]);

  const liveEval = useMemo(
    () =>
      evaluatePiezaChecklist(
        {
          clase,
          texto,
          visual,
          objetivo: objetivo || null,
          guion_id: guionId,
          palabra_clave_id: palabraClaveId,
          checklist
        },
        guiones,
        palabras
      ),
    [clase, texto, visual, objetivo, guionId, palabraClaveId, checklist, guiones, palabras]
  );

  const openNewPieza = (initial: {
    clase: 'gancho' | 'cta';
    texto?: string;
    gancho_tipo_id?: number | null;
  }) => {
    setEditingPiezaId(null);
    setClase(initial.clase);
    setTexto(initial.texto || '');
    setVisual('');
    setSelectedTipoId(initial.gancho_tipo_id ?? null);
    setObjetivo('');
    setPalabraClaveId(null);
    setGuionId(null);
    setEstadoPieza('potencial');
    setChecklist({});
    setResultado(null);
    setNota('');
    setCopyToGuionScene(true);
    setShowPiezaModal(true);
  };

  const openEditPieza = (p: PiezaResumen) => {
    setEditingPiezaId(p.id);
    setClase(p.clase);
    setTexto(p.texto);
    setVisual(p.visual || '');
    setSelectedTipoId(p.gancho_tipo_id ?? null);
    setObjetivo(p.objetivo || '');
    setPalabraClaveId(p.palabra_clave_id ?? null);
    setGuionId(p.guion_id ?? null);
    setEstadoPieza(p.estado || 'potencial');
    setChecklist({ ...(p.checklist || {}) });
    setResultado(p.resultado ?? null);
    setNota(p.nota || '');
    setCopyToGuionScene(false);
    setShowPiezaModal(true);
  };

  const handleSavePieza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    try {
      let savedId = editingPiezaId;
      if (editingPiezaId) {
        await updatePiezaGanchoCta(editingPiezaId, {
          texto: texto.trim(),
          visual: visual.trim() || null,
          gancho_tipo_id: clase === 'gancho' ? selectedTipoId : null,
          objetivo: clase === 'cta' ? objetivo || null : null,
          palabra_clave_id: clase === 'cta' ? palabraClaveId : null,
          guion_id: guionId,
          estado: estadoPieza,
          checklist,
          resultado: estadoPieza === 'usado' ? resultado : null,
          nota: nota.trim() || null
        });
      } else {
        savedId = await createPiezaGanchoCta({
          clase,
          texto,
          visual,
          gancho_tipo_id: clase === 'gancho' ? selectedTipoId : null,
          objetivo: clase === 'cta' ? objetivo : undefined,
          palabra_clave_id: clase === 'cta' ? palabraClaveId : null,
          guion_id: guionId,
          estado: estadoPieza,
          checklist,
          resultado,
          nota
        });
      }

      if (savedId && estadoPieza === 'en_uso' && guionId) {
        await assignPiezaToGuion(
          { id: savedId, clase, texto: texto.trim() },
          guionId,
          copyToGuionScene
        );
      }

      setShowPiezaModal(false);
      await loadAll();
      onNotify(`${clase === 'gancho' ? 'Gancho' : 'CTA'} guardado en el banco`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const handleVotePieza = async (piezaId: number, stars: number) => {
    if (!activeUser) {
      onNotify('Elige tu usuario arriba para votar');
      return;
    }
    await savePiezaVoto(piezaId, activeUser.id, stars);
    await loadAll();
    onNotify(`Voto de ${stars}★ guardado`);
  };

  const handleCreateKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;
    await createPalabraClave({
      palabra: newWord,
      variantes: newVariantes,
      recurso: newRecurso,
      herramienta: newHerramienta
    });
    setNewWord('');
    setNewVariantes('');
    setNewRecurso('');
    setNewHerramienta('');
    await loadAll();
    onNotify('Palabra clave agregada');
  };

  const handleDeletePieza = async (p: PiezaResumen) => {
    if (!window.confirm(`¿Eliminar este ${p.clase} del banco?`)) return;
    try {
      await deletePiezaGanchoCta(p.id);
      await loadAll();
      onNotify('Elemento eliminado');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  const handleDeleteKeyword = async (kw: PalabraClave) => {
    if (!window.confirm(`¿Eliminar la palabra clave "${kw.palabra}"?`)) return;
    try {
      await deletePalabraClave(kw.id);
      await loadAll();
      onNotify('Palabra clave eliminada');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          Ejecuta el esquema de ReelLab en Supabase para cargar los 49 tipos de gancho y el banco
          de CTA.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="tabs">
        <button
          type="button"
          className={`tab-btn ${tab === 'tipos' ? 'active' : ''}`}
          onClick={() => setTab('tipos')}
        >
          49 Tipos
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'banco' ? 'active' : ''}`}
          onClick={() => setTab('banco')}
        >
          Banco ({piezas.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'palabras' ? 'active' : ''}`}
          onClick={() => setTab('palabras')}
        >
          Palabras clave
        </button>
      </div>

      {tab === 'tipos' && (
        <>
          <div className="card" style={{ gap: 8, padding: 12 }}>
            <input
              className="input"
              placeholder="Buscar tipo de gancho, plantilla o ejemplo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
            >
              <option value="all">Todas las familias ({families.length})</option>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredTipos.map((t) => (
              <div key={t.id} className="card" style={{ gap: 8 }}>
                <div className="row-between">
                  <span className="badge">{t.familia}</span>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    #{t.numero}
                  </span>
                </div>
                <strong style={{ fontSize: '1.05rem' }}>{t.nombre}</strong>
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  {t.mecanismo}
                </p>
                <div
                  style={{
                    background: 'var(--bg-input)',
                    padding: 10,
                    borderRadius: 8,
                    fontSize: '0.88rem'
                  }}
                >
                  <div>
                    <strong>Plantilla:</strong> {t.plantilla}
                  </div>
                  <div style={{ marginTop: 4, color: '#cbd5e1' }}>
                    <strong>Ejemplo:</strong> {t.ejemplo}
                  </div>
                </div>
                {t.advertencia && (
                  <div className="alert warning" style={{ padding: '6px 10px', fontSize: '0.82rem' }}>
                    {t.advertencia}
                  </div>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void copyToClipboard(t.plantilla).then((ok) =>
                        onNotify(ok ? 'Plantilla copiada' : 'No se pudo copiar')
                      )
                    }
                  >
                    <Copy size={14} />
                    Copiar plantilla
                  </button>
                  {!t.advertencia?.startsWith('Evitar') && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        openNewPieza({
                          clase: 'gancho',
                          texto: t.ejemplo !== '—' ? t.ejemplo : t.plantilla,
                          gancho_tipo_id: t.id
                        })
                      }
                    >
                      <Sparkles size={14} />
                      Usar en banco
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'banco' && (
        <>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="section-title">Ganchos y CTA ({filteredPiezas.length})</h2>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => openNewPieza({ clase: 'cta' })}
              >
                <Plus size={15} />
                + CTA
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openNewPieza({ clase: 'gancho' })}
              >
                <Plus size={15} />
                + Gancho
              </button>
            </div>
          </div>

          <div className="card" style={{ gap: 8, padding: 12 }}>
            <input
              className="input"
              placeholder="Buscar texto, visual o nota..."
              value={bancoSearch}
              onChange={(e) => setBancoSearch(e.target.value)}
            />
            <div className="row" style={{ gap: 8 }}>
              <select
                className="select"
                value={bancoClase}
                onChange={(e) => setBancoClase(e.target.value as typeof bancoClase)}
              >
                <option value="all">Ganchos y CTA</option>
                <option value="gancho">Solo ganchos</option>
                <option value="cta">Solo CTA</option>
              </select>
              <select
                className="select"
                value={bancoEstado}
                onChange={(e) => setBancoEstado(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(ESTADOS_PIEZA).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredPiezas.map((p) => {
            const evalRes = evaluatePiezaChecklist(p, guiones, palabras);
            return (
              <div key={p.id} className="card" style={{ gap: 8 }}>
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${p.clase === 'cta' ? 'libreto' : ''}`}>
                      {p.clase.toUpperCase()}
                    </span>
                    <span className="badge">{ESTADOS_PIEZA[p.estado] || p.estado}</span>
                    {p.tipo_nombre && <span className="badge estructura">{p.tipo_nombre}</span>}
                    {p.guion_numero != null && (
                      <span className="badge">Guion {p.guion_numero}</span>
                    )}
                    {p.palabra && <span className="badge notas">Palabra: {p.palabra}</span>}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge" title="Calificador automático y manual">
                      <CheckCircle2 size={12} />
                      {evalRes.yesCount}/{evalRes.totalCount}
                    </span>
                    {p.voto_promedio != null && (
                      <span className="badge notas">
                        ★ {p.voto_promedio} ({p.votos})
                      </span>
                    )}
                  </div>
                </div>

                <p
                  style={{ margin: 0, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => openEditPieza(p)}
                >
                  “{p.texto}”
                </p>
                {p.visual && (
                  <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
                    Visual: {p.visual}
                  </p>
                )}

                <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div className="row" style={{ gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void handleVotePieza(p.id, s)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          color: '#fbbf24'
                        }}
                      >
                        <Star size={17} />
                      </button>
                    ))}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEditPieza(p)}
                    >
                      Calificar / Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        void copyToClipboard(p.texto).then((ok) =>
                          onNotify(ok ? 'Texto copiado' : 'No se pudo copiar')
                        )
                      }
                    >
                      <Copy size={14} />
                      Copiar
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Eliminar elemento"
                      onClick={() => void handleDeletePieza(p)}
                    >
                      <Trash2 size={15} color="#f87171" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'palabras' && (
        <>
          <form onSubmit={handleCreateKeyword} className="card">
            <div className="row">
              <Hash size={18} color="#38bdf8" />
              <strong>Nueva palabra clave para CTA</strong>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Palabra clave (ej. PACK, GUIA)</label>
                <input
                  className="input"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Variantes (opcional)</label>
                <input
                  className="input"
                  value={newVariantes}
                  onChange={(e) => setNewVariantes(e.target.value)}
                  placeholder="ej. guia, guias"
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Recurso que recibe quien la comenta</label>
                <input
                  className="input"
                  value={newRecurso}
                  onChange={(e) => setNewRecurso(e.target.value)}
                  placeholder="Ej. Link del catálogo por DM"
                />
              </div>
              <div className="field">
                <label>Herramienta que responde</label>
                <select
                  className="select"
                  value={newHerramienta}
                  onChange={(e) => setNewHerramienta(e.target.value)}
                >
                  <option value="">—</option>
                  {HERRAMIENTAS_RESPONDE.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              Guardar palabra clave
            </button>
          </form>

          {palabras.map((kw) => {
            const uses = piezas.filter((p) => p.palabra_clave_id === kw.id).length;
            return (
              <div
                key={kw.id}
                className="card"
                style={{ gap: 6, opacity: kw.activa ? 1 : 0.6 }}
              >
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <strong>{kw.palabra}</strong>
                    {kw.codigo && (
                      <code style={{ fontSize: '0.78rem', color: '#38bdf8' }}>{kw.codigo}</code>
                    )}
                    {kw.herramienta && <span className="badge">{kw.herramienta}</span>}
                    <span className="badge">{uses} usos</span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <label className="row" style={{ gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={kw.activa}
                        onChange={(e) =>
                          void togglePalabraClaveActiva(kw.id, e.target.checked).then(loadAll)
                        }
                      />
                      Activa
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Eliminar palabra clave"
                      onClick={() => void handleDeleteKeyword(kw)}
                    >
                      <Trash2 size={15} color="#f87171" />
                    </button>
                  </div>
                </div>
                {kw.recurso && <span className="muted">{kw.recurso}</span>}
                {kw.variantes && (
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    Variantes: {kw.variantes}
                  </span>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Modal Crear / Editar + Calificador de Gancho o CTA */}
      {showPiezaModal && (
        <div className="storyboard-overlay">
          <form
            className="storyboard-container"
            style={{ maxWidth: 640 }}
            onSubmit={(e) => void handleSavePieza(e)}
          >
            <div className="row-between">
              <strong>
                {editingPiezaId
                  ? `Editar ${clase === 'gancho' ? 'Gancho' : 'CTA'}`
                  : `Nuevo ${clase === 'gancho' ? 'Gancho' : 'CTA'}`}
              </strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPiezaModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="field">
              <div className="row-between">
                <label>{clase === 'gancho' ? 'Gancho (lo que se dice)' : 'CTA (lo que se dice)'}</label>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  {countWords(texto)} palabras · ≈{Math.max(1, Math.round(countWords(texto) / 3))} s
                </span>
              </div>
              <textarea
                className="textarea"
                rows={3}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Lo que se ve (acción, texto en pantalla o plano)</label>
              <input
                className="input"
                value={visual}
                onChange={(e) => setVisual(e.target.value)}
                placeholder="Ej. Caja abierta en primer plano..."
              />
            </div>

            {clase === 'gancho' ? (
              <div className="field">
                <label>Tipo de gancho (49 tipos)</label>
                <select
                  className="select"
                  value={selectedTipoId ?? ''}
                  onChange={(e) =>
                    setSelectedTipoId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">—</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.numero} · {t.nombre} ({t.familia})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid-2">
                <div className="field">
                  <label>Objetivo</label>
                  <select
                    className="select"
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                  >
                    <option value="">—</option>
                    {OBJETIVOS_CTA.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Palabra clave</label>
                  <select
                    className="select"
                    value={palabraClaveId ?? ''}
                    onChange={(e) =>
                      setPalabraClaveId(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Ninguna</option>
                    {palabras
                      .filter((k) => k.activa || k.id === palabraClaveId)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.palabra}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid-2">
              <div className="field">
                <label>Guion asignado</label>
                <select
                  className="select"
                  value={guionId ?? ''}
                  onChange={(e) =>
                    setGuionId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Sin asignar</option>
                  {guiones.map((g) => (
                    <option key={g.id} value={g.id}>
                      Guion {g.numero ?? g.id} · {g.titulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Estado</label>
                <select
                  className="select"
                  value={estadoPieza}
                  onChange={(e) => setEstadoPieza(e.target.value as PiezaResumen['estado'])}
                >
                  {Object.entries(ESTADOS_PIEZA).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {estadoPieza === 'en_uso' && guionId && (
              <label className="row" style={{ gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={copyToGuionScene}
                  onChange={(e) => setCopyToGuionScene(e.target.checked)}
                />
                Copiar también el texto a la escena del guion
              </label>
            )}

            {estadoPieza === 'usado' && (
              <div className="row-between">
                <span style={{ fontSize: '0.86rem' }}>¿Cómo funcionó al publicarse?</span>
                <div className="row" style={{ gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setResultado(resultado === n ? null : n)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 2,
                        color: n <= (resultado || 0) ? '#fbbf24' : '#475569'
                      }}
                    >
                      <Star size={18} fill={n <= (resultado || 0) ? '#fbbf24' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calificador automático + manual */}
            <div className="card" style={{ padding: 12, gap: 8 }}>
              <div className="row-between">
                <strong>Calificador</strong>
                <span className="badge estructura">
                  {liveEval.yesCount} de {liveEval.totalCount}
                </span>
              </div>
              {liveEval.items.map((item) => (
                <div
                  key={item.key}
                  className="row-between"
                  style={{
                    gap: 8,
                    background: 'var(--bg-input)',
                    padding: '6px 10px',
                    borderRadius: 8
                  }}
                >
                  <div style={{ flex: 1, fontSize: '0.82rem' }}>
                    {item.label}
                    {item.isAuto && (
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        La app lo revisa automáticamente
                      </div>
                    )}
                  </div>
                  {item.isAuto ? (
                    <span
                      className={`badge ${item.value ? '' : 'notas'}`}
                      style={{ minWidth: 36, justifyContent: 'center' }}
                    >
                      {item.value ? 'Sí' : 'No'}
                    </span>
                  ) : (
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          item.value === true ? 'btn-primary' : 'btn-secondary'
                        }`}
                        style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() =>
                          setChecklist((prev) => ({ ...prev, [item.key]: true }))
                        }
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          item.value === false ? 'btn-danger' : 'btn-secondary'
                        }`}
                        style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() =>
                          setChecklist((prev) => ({ ...prev, [item.key]: false }))
                        }
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="field">
              <label>Nota (opcional)</label>
              <textarea
                className="textarea"
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPiezaModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
