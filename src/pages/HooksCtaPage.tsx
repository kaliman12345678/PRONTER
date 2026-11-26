import { useEffect, useMemo, useState } from 'react';
import { Copy, Hash, Plus, Sparkles, Star } from 'lucide-react';
import {
  createPalabraClave,
  createPiezaGanchoCta,
  fetchGanchoTipos,
  fetchPalabrasClave,
  fetchPiezasGanchoCta,
  savePiezaVoto
} from '../db/reellabService';
import type {
  GanchoTipo,
  PalabraClave,
  PiezaResumen,
  Votante
} from '../types/reellab';
import { copyToClipboard } from '../utils/clipboard';

interface Props {
  activeUser: Votante | null;
  schemaMissing: boolean;
  onNotify: (msg: string) => void;
}

export function HooksCtaPage({ activeUser, schemaMissing, onNotify }: Props) {
  const [tab, setTab] = useState<'tipos' | 'banco' | 'palabras'>('tipos');
  const [tipos, setTipos] = useState<GanchoTipo[]>([]);
  const [piezas, setPiezas] = useState<PiezaResumen[]>([]);
  const [palabras, setPalabras] = useState<PalabraClave[]>([]);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');

  const [showNewPieza, setShowNewPieza] = useState(false);
  const [clase, setClase] = useState<'gancho' | 'cta'>('gancho');
  const [texto, setTexto] = useState('');
  const [visual, setVisual] = useState('');
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);

  const [newWord, setNewWord] = useState('');
  const [newRecurso, setNewRecurso] = useState('');

  const loadAll = async () => {
    const [tList, pList, kwList] = await Promise.all([
      fetchGanchoTipos(),
      fetchPiezasGanchoCta(),
      fetchPalabrasClave()
    ]);
    setTipos(tList);
    setPiezas(pList);
    setPalabras(kwList);
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

  const handleCreatePieza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    await createPiezaGanchoCta({
      clase,
      texto,
      visual,
      gancho_tipo_id: selectedTipoId
    });
    setTexto('');
    setVisual('');
    setSelectedTipoId(null);
    setShowNewPieza(false);
    await loadAll();
    onNotify(`${clase === 'gancho' ? 'Gancho' : 'CTA'} guardado en el banco`);
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
    await createPalabraClave({ palabra: newWord, recurso: newRecurso });
    setNewWord('');
    setNewRecurso('');
    await loadAll();
    onNotify('Palabra clave agregada');
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          Ejecuta <code>ReelLab-kit/supabase/instalar.sql</code> en Supabase para cargar los 49
          tipos de gancho y el banco de CTA.
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
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setClase('gancho');
                      setTexto(t.plantilla);
                      setSelectedTipoId(t.id);
                      setShowNewPieza(true);
                      setTab('banco');
                    }}
                  >
                    <Sparkles size={14} />
                    Usar en banco
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'banco' && (
        <>
          <div className="row-between">
            <h2 className="section-title">Ganchos y CTA del equipo</h2>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowNewPieza((v) => !v)}
            >
              <Plus size={15} />
              Nuevo
            </button>
          </div>

          {showNewPieza && (
            <form onSubmit={handleCreatePieza} className="card">
              <div className="field">
                <label>Tipo</label>
                <select
                  className="select"
                  value={clase}
                  onChange={(e) => setClase(e.target.value as 'gancho' | 'cta')}
                >
                  <option value="gancho">Gancho</option>
                  <option value="cta">CTA (Llamado a la acción)</option>
                </select>
              </div>
              <div className="field">
                <label>Texto</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Indicación visual (opcional)</label>
                <input
                  className="input"
                  value={visual}
                  onChange={(e) => setVisual(e.target.value)}
                  placeholder="Ej. Plano medio con caja abierta..."
                />
              </div>
              <div className="row">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewPieza(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {piezas.map((p) => (
            <div key={p.id} className="card" style={{ gap: 8 }}>
              <div className="row-between">
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${p.clase === 'cta' ? 'libreto' : ''}`}>
                    {p.clase.toUpperCase()}
                  </span>
                  {p.tipo_nombre && <span className="badge estructura">{p.tipo_nombre}</span>}
                </div>
                {p.voto_promedio && (
                  <span className="badge notas">
                    ★ {p.voto_promedio} ({p.votos})
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontWeight: 600 }}>{p.texto}</p>
              {p.visual && <p className="muted" style={{ margin: 0 }}>{p.visual}</p>}
              <div className="row-between">
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
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'palabras' && (
        <>
          <form onSubmit={handleCreateKeyword} className="card">
            <div className="row">
              <Hash size={18} color="#38bdf8" />
              <strong>Nueva palabra clave para CTA</strong>
            </div>
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
              <label>Recurso que recibe quien la comenta</label>
              <input
                className="input"
                value={newRecurso}
                onChange={(e) => setNewRecurso(e.target.value)}
                placeholder="Ej. Link del catálogo por DM"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              Guardar palabra clave
            </button>
          </form>

          {palabras.map((kw) => (
            <div key={kw.id} className="card" style={{ gap: 4 }}>
              <strong>{kw.palabra}</strong>
              {kw.recurso && <span className="muted">{kw.recurso}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
