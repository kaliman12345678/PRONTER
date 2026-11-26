import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FileSpreadsheet,
  Flame,
  Plus,
  Star,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  createGuionFromIdea,
  createIdea,
  createLote,
  deleteIdea,
  fetchCatalogos,
  fetchGuiones,
  fetchIdeas,
  fetchLotes,
  fetchPesosViralidad,
  fetchVotosDeUsuario,
  saveIdeaVoto,
  updateIdea
} from '../db/reellabService';
import type {
  CatalogoItem,
  GuionResumen,
  IdeaConPuntaje,
  Lote,
  PesoViralidad,
  Votante
} from '../types/reellab';

interface Props {
  activeUser: Votante | null;
  schemaMissing: boolean;
  onOpenStoryboard: (guion: GuionResumen) => void;
  onNotify: (msg: string) => void;
}

const CONCIENCIA_LABELS = [
  '0 · Inconsciente',
  '1 · Consciente del problema',
  '2 · Consciente de la solución',
  '3 · Consciente del producto',
  '4 · Más consciente'
];

export function IdeasPage({
  activeUser,
  schemaMissing,
  onOpenStoryboard,
  onNotify
}: Props) {
  const [ideas, setIdeas] = useState<IdeaConPuntaje[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoItem[]>([]);
  const [pesos, setPesos] = useState<PesoViralidad[]>([]);
  const [guiones, setGuiones] = useState<GuionResumen[]>([]);
  const [myVotes, setMyVotes] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  const [filterMode, setFilterMode] = useState<'all' | 'unvoted' | 'voted' | 'with_guion'>('all');
  const [filterLote, setFilterLote] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTexto, setNewTexto] = useState('');
  const [newPilar, setNewPilar] = useState('');
  const [newFormato, setNewFormato] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ideaList, loteList, catList, pesoList, guionList] = await Promise.all([
        fetchIdeas(),
        fetchLotes(),
        fetchCatalogos(),
        fetchPesosViralidad(),
        fetchGuiones()
      ]);
      setIdeas(ideaList);
      setLotes(loteList);
      setCatalogos(catList);
      setPesos(pesoList);
      setGuiones(guionList);
      if (activeUser) {
        const votes = await fetchVotosDeUsuario(activeUser.id);
        setMyVotes(votes);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!schemaMissing) {
      void loadAll();
    } else {
      setLoading(false);
    }
  }, [activeUser?.id, schemaMissing]);

  const pilares = useMemo(
    () => catalogos.filter((c) => c.tipo === 'pilar').map((c) => c.valor),
    [catalogos]
  );
  const formatos = useMemo(
    () => catalogos.filter((c) => c.tipo === 'formato').map((c) => c.valor),
    [catalogos]
  );

  const filteredIdeas = useMemo(() => {
    return ideas.filter((idea) => {
      if (filterLote !== 'all' && String(idea.lote_id ?? '') !== filterLote) return false;
      if (filterMode === 'unvoted' && myVotes[idea.id]) return false;
      if (filterMode === 'voted' && !myVotes[idea.id]) return false;
      if (filterMode === 'with_guion' && !idea.guion_id) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${idea.titulo} ${idea.texto_base || ''} ${idea.pilar || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ideas, filterLote, filterMode, myVotes, search]);

  const handleCreateIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const targetLoteId =
        filterLote !== 'all' ? Number(filterLote) : lotes[0]?.id ?? null;
      await createIdea({
        titulo: newTitle,
        texto_base: newTexto,
        pilar: newPilar || undefined,
        formato: newFormato || undefined,
        referencia_url: newUrl || undefined,
        lote_id: targetLoteId
      });
      setNewTitle('');
      setNewTexto('');
      setNewUrl('');
      setShowNewForm(false);
      await loadAll();
      onNotify('Idea agregada');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al crear idea');
    }
  };

  const handleVote = async (ideaId: number, stars: number) => {
    if (!activeUser) {
      onNotify('Elige tu usuario arriba para votar');
      return;
    }
    setMyVotes((prev) => ({ ...prev, [ideaId]: stars }));
    await saveIdeaVoto(ideaId, activeUser.id, stars);
    await loadAll();
    onNotify(`Voto de ${stars}★ guardado`);
  };

  const handleToggleCriterion = async (
    idea: IdeaConPuntaje,
    field:
      | 'nino_5'
      | 'gusta_50'
      | 'ref_viral'
      | 'mercado_viral'
      | 'tendencia'
      | 'controversia'
  ) => {
    await updateIdea(idea.id, {
      [field]: !idea[field],
      calificada: true
    });
    await loadAll();
  };

  const handleImportExcelIdeas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (rows.length === 0) {
        onNotify('El Excel no tiene filas');
        return;
      }

      const lote = await createLote();
      let imported = 0;

      for (const row of rows) {
        const keys = Object.keys(row);
        const getVal = (patterns: RegExp) => {
          const k = keys.find((key) => patterns.test(key));
          return k ? String(row[k] ?? '').trim() : '';
        };
        const titulo = getVal(/t[ií]tulo|idea|gancho/i) || String(Object.values(row)[0] || '').trim();
        if (!titulo) continue;

        await createIdea({
          titulo,
          texto_base: getVal(/texto|guion|descripci|contenido/i),
          pilar: getVal(/pilar/i) || undefined,
          tematica: getVal(/tem[aá]tica/i) || undefined,
          formato: getVal(/formato/i) || undefined,
          referencia_url: getVal(/url|enlace|referencia|link/i) || undefined,
          lote_id: lote.id
        });
        imported++;
      }

      await loadAll();
      onNotify(`${imported} ideas importadas en ${lote.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo leer el Excel');
    }
  };

  const handleOpenOrCreateGuion = async (idea: IdeaConPuntaje) => {
    try {
      const existing = guiones.find((g) => g.id === idea.guion_id);
      const guion = existing || (await createGuionFromIdea(idea));
      await loadAll();
      onOpenStoryboard(guion);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo abrir el guion');
    }
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          <strong>Falta instalar las tablas de ReelLab en Supabase</strong>
          <p style={{ margin: '6px 0 0' }}>
            Abre el <strong>SQL Editor</strong> de tu proyecto Supabase, pega el contenido de{' '}
            <code>ReelLab-kit/supabase/instalar.sql</code> y presiona <strong>Run</strong>. Luego
            recarga esta app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Banco de Ideas ({filteredIdeas.length})</h2>
        <div className="row" style={{ gap: 6 }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <FileSpreadsheet size={15} color="#34d399" />
            Subir Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImportExcelIdeas}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowNewForm((v) => !v)}
          >
            <Plus size={15} />
            Nueva idea
          </button>
        </div>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreateIdea} className="card">
          <div className="field">
            <label htmlFor="idea-title">Título de la idea</label>
            <input
              id="idea-title"
              className="input"
              placeholder="Ej. 3 errores al empacar un pedido"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="idea-base">Texto base / resumen (opcional)</label>
            <textarea
              id="idea-base"
              className="textarea"
              rows={3}
              value={newTexto}
              onChange={(e) => setNewTexto(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Pilar</label>
              <select
                className="select"
                value={newPilar}
                onChange={(e) => setNewPilar(e.target.value)}
              >
                <option value="">(Sin pilar)</option>
                {pilares.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Formato</label>
              <select
                className="select"
                value={newFormato}
                onChange={(e) => setNewFormato(e.target.value)}
              >
                <option value="">(Sin formato)</option>
                {formatos.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="idea-url">Enlace de referencia (opcional)</label>
            <input
              id="idea-url"
              type="url"
              className="input"
              placeholder="https://..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Guardar idea
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowNewForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ gap: 8, padding: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px' }}
            placeholder="Buscar idea..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            style={{ width: 'auto', padding: '8px 10px' }}
            value={filterLote}
            onChange={(e) => setFilterLote(e.target.value)}
          >
            <option value="all">Todos los lotes</option>
            {lotes.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="tabs">
          {[
            ['all', 'Todas'],
            ['unvoted', 'Falta votar'],
            ['voted', 'Ya voté'],
            ['with_guion', 'Con Guion']
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`tab-btn ${filterMode === key ? 'active' : ''}`}
              style={{ fontSize: '0.78rem', minHeight: 34 }}
              onClick={() => setFilterMode(key as typeof filterMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="muted">Cargando ideas...</p>
      ) : filteredIdeas.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No hay ideas que coincidan con este filtro.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredIdeas.map((idea) => {
            const isExpanded = expandedId === idea.id;
            const userVote = myVotes[idea.id] || 0;
            return (
              <div key={idea.id} className="card" style={{ gap: 10 }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                  >
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                      {idea.pilar && <span className="badge">{idea.pilar}</span>}
                      {idea.formato && <span className="badge libreto">{idea.formato}</span>}
                      <span className="badge estructura">
                        <Flame size={12} />
                        {Number(idea.puntaje_total || 0).toFixed(1)} pts
                      </span>
                      {idea.voto_promedio && (
                        <span className="badge notas">
                          ★ {idea.voto_promedio} ({idea.votos})
                        </span>
                      )}
                      {idea.guion_id && <span className="badge">Con Guion</span>}
                    </div>
                    <strong style={{ fontSize: '1.03rem' }}>{idea.titulo}</strong>
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                    aria-label="Ver detalles"
                  >
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                {/* Star voting row */}
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div className="row" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: '0.8rem', marginRight: 4 }}>
                      Tu voto:
                    </span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => void handleVote(idea.id, star)}
                        aria-label={`Votar ${star} estrellas`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          color: star <= userVote ? '#fbbf24' : '#475569'
                        }}
                      >
                        <Star
                          size={20}
                          fill={star <= userVote ? '#fbbf24' : 'none'}
                        />
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleOpenOrCreateGuion(idea)}
                  >
                    <Clapperboard size={15} />
                    {idea.guion_id ? 'Abrir Guion / Storyboard' : 'Crear Guion'}
                  </button>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      borderTop: '1px solid var(--border)',
                      paddingTop: 10
                    }}
                  >
                    {idea.texto_base && (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}>
                        {idea.texto_base}
                      </p>
                    )}

                    <div className="field">
                      <label>Calculadora de Viralidad (máx 14 pts)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                        {(
                          [
                            ['nino_5', '¿La entiende un niño de 5 años?'],
                            ['gusta_50', '¿Le gustaría a 50 de cada 100?'],
                            ['ref_viral', '¿Es una referencia viral?'],
                            ['mercado_viral', '¿Es un mercado viral?'],
                            ['tendencia', '¿Está en tendencia?'],
                            ['controversia', '¿Genera controversia?']
                          ] as const
                        ).map(([key, fallbackLabel]) => {
                          const pesoItem = pesos.find((p) => p.clave === key);
                          return (
                            <label
                              key={key}
                              className="row-between"
                              style={{
                                background: 'var(--bg-input)',
                                padding: '8px 10px',
                                borderRadius: 8,
                                cursor: 'pointer'
                              }}
                            >
                              <span className="row" style={{ gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={idea[key]}
                                  onChange={() => void handleToggleCriterion(idea, key)}
                                />
                                <span style={{ fontSize: '0.88rem' }}>
                                  {pesoItem?.etiqueta || fallbackLabel}
                                </span>
                              </span>
                              <span className="muted" style={{ fontSize: '0.8rem' }}>
                                +{pesoItem?.peso ?? 0}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="row" style={{ gap: 8 }}>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Nivel de conciencia (0–4)</label>
                        <select
                          className="select"
                          value={idea.nivel_conciencia ?? ''}
                          onChange={(e) =>
                            void updateIdea(idea.id, {
                              nivel_conciencia:
                                e.target.value === '' ? null : Number(e.target.value)
                            }).then(loadAll)
                          }
                        >
                          <option value="">Sin definir</option>
                          {CONCIENCIA_LABELS.map((lbl, i) => (
                            <option key={i} value={i}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field" style={{ flex: 1 }}>
                        <label>Formato (suma peso)</label>
                        <select
                          className="select"
                          value={idea.formato || ''}
                          onChange={(e) =>
                            void updateIdea(idea.id, {
                              formato: e.target.value || null
                            }).then(loadAll)
                          }
                        >
                          <option value="">Sin formato</option>
                          {formatos.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="row-between">
                      <span className="muted" style={{ fontSize: '0.8rem' }}>
                        {idea.lote_nombre || 'Sin lote'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar la idea "${idea.titulo}"?`)) {
                            void deleteIdea(idea.id).then(loadAll);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
