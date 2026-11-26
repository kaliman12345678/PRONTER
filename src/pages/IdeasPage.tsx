import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  FileSpreadsheet,
  Flame,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  clearIdeaVoto,
  createGuionFromIdea,
  createIdea,
  createLote,
  deleteIdea,
  fetchAllIdeaVotos,
  fetchCatalogos,
  fetchGuiones,
  fetchIdeas,
  fetchLotes,
  fetchPesosViralidad,
  fetchVotantes,
  rescueIdeaToLote,
  saveIdeaVoto,
  updateIdea
} from '../db/reellabService';
import type {
  CatalogoItem,
  GuionResumen,
  IdeaConPuntaje,
  IdeaEstado,
  Lote,
  PesoViralidad,
  Votante,
  VotoIdea
} from '../types/reellab';
import { findSimilarIdeas, suggestAwarenessLevel } from '../utils/ideaSimilarity';

interface Props {
  activeUser: Votante | null;
  schemaMissing: boolean;
  onOpenStoryboard: (guion: GuionResumen) => void;
  onOpenProcess?: () => void;
  onGoScripts?: () => void;
  onNotify: (msg: string) => void;
}

const CONCIENCIA_LABELS = [
  '0 · No sabe que tiene el problema',
  '1 · Sabe que tiene el problema',
  '2 · Sabe cómo se soluciona',
  '3 · Sabe quién lo soluciona',
  '4 · Sabe con qué producto'
];

const ESTADOS_LABEL: Record<IdeaEstado, string> = {
  nueva: 'Nueva',
  calificada: 'Calificada',
  aprobada: 'Aprobada',
  en_espera: 'En espera',
  descartada: 'Descartada',
  en_guion: 'En guion'
};

const UMBRAL_STORAGE_KEY = 'pronter-ideas-umbral-v1';

interface ExcelPreviewRow {
  include: boolean;
  titulo: string;
  texto_base: string;
  pilar: string;
  tematica: string;
  formato: string;
  referencia_url: string;
  contexto: string;
  palabras_clave: string;
  herramienta: string;
  votos: Array<[number, number]>;
  similar: IdeaConPuntaje[];
}

export function IdeasPage({
  activeUser,
  schemaMissing,
  onOpenStoryboard,
  onOpenProcess,
  onGoScripts,
  onNotify
}: Props) {
  const [ideas, setIdeas] = useState<IdeaConPuntaje[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoItem[]>([]);
  const [pesos, setPesos] = useState<PesoViralidad[]>([]);
  const [guiones, setGuiones] = useState<GuionResumen[]>([]);
  const [votantes, setVotantes] = useState<Votante[]>([]);
  const [allVotos, setAllVotos] = useState<VotoIdea[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterMode, setFilterMode] = useState<'all' | 'unvoted' | 'voted' | 'with_guion'>('all');
  const [filterLote, setFilterLote] = useState<string>('all');
  const [filterPilar, setFilterPilar] = useState<string>('all');
  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'voto' | 'puntaje' | 'numero' | 'reciente'>('voto');
  const [umbral, setUmbral] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(UMBRAL_STORAGE_KEY));
      return Number.isFinite(saved) && saved > 0 ? saved : 6;
    } catch {
      return 6;
    }
  });
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // New idea form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTexto, setNewTexto] = useState('');
  const [newPilar, setNewPilar] = useState('');
  const [newFormato, setNewFormato] = useState('');
  const [newUrl, setNewUrl] = useState('');

  // Excel preview modal
  const [excelRows, setExcelRows] = useState<ExcelPreviewRow[] | null>(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelTargetLote, setExcelTargetLote] = useState<string>('nuevo');
  const [importingExcel, setImportingExcel] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ideaList, loteList, catList, pesoList, guionList, votantesRes, votosList] =
        await Promise.all([
          fetchIdeas(),
          fetchLotes(),
          fetchCatalogos(),
          fetchPesosViralidad(),
          fetchGuiones(),
          fetchVotantes(),
          fetchAllIdeaVotos()
        ]);
      setIdeas(ideaList);
      setLotes(loteList);
      setCatalogos(catList);
      setPesos(pesoList);
      setGuiones(guionList);
      setVotantes(votantesRes.users.filter((u) => u.activo));
      setAllVotos(votosList);
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

  const mostRecentLote = useMemo(() => {
    if (lotes.length === 0) return null;
    return [...lotes].sort((a, b) => b.numero - a.numero)[0];
  }, [lotes]);

  const votesByIdea = useMemo(() => {
    const map = new Map<number, VotoIdea[]>();
    for (const v of allVotos) {
      if (!map.has(v.idea_id)) map.set(v.idea_id, []);
      map.get(v.idea_id)!.push(v);
    }
    return map;
  }, [allVotos]);

  const myVotes = useMemo(() => {
    const map: Record<number, number> = {};
    if (!activeUser) return map;
    for (const v of allVotos) {
      if (v.votante_id === activeUser.id) {
        map[v.idea_id] = v.puntaje;
      }
    }
    return map;
  }, [allVotos, activeUser]);

  const similarToNew = useMemo(() => {
    if (!showNewForm || newTitle.trim().length < 4) return [];
    return findSimilarIdeas(newTitle, newTexto, ideas);
  }, [showNewForm, newTitle, newTexto, ideas]);

  const filteredIdeas = useMemo(() => {
    const list = ideas.filter((idea) => {
      if (filterLote !== 'all' && String(idea.lote_id ?? '') !== filterLote) return false;
      if (filterPilar !== 'all' && (idea.pilar || '') !== filterPilar) return false;
      if (filterEstado !== 'all' && idea.estado !== filterEstado) return false;
      if (filterMode === 'unvoted' && myVotes[idea.id]) return false;
      if (filterMode === 'voted' && !myVotes[idea.id]) return false;
      if (filterMode === 'with_guion' && !idea.guion_id) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${idea.titulo} ${idea.texto_base || ''} ${idea.pilar || ''} ${idea.palabras_clave || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'voto') {
        const va = a.voto_promedio ?? -1;
        const vb = b.voto_promedio ?? -1;
        return vb - va || b.puntaje_total - a.puntaje_total;
      }
      if (sortBy === 'puntaje') {
        return (
          Number(b.calificada) - Number(a.calificada) ||
          b.puntaje_total - a.puntaje_total ||
          (b.voto_promedio ?? -1) - (a.voto_promedio ?? -1)
        );
      }
      if (sortBy === 'numero') {
        return (a.numero ?? 1e9) - (b.numero ?? 1e9);
      }
      return new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime();
    });
  }, [ideas, filterLote, filterPilar, filterEstado, filterMode, myVotes, search, sortBy]);

  const handleDownloadTemplate = () => {
    const headers = [
      'Idea / Título',
      'Guion / Texto base',
      'Pilar',
      'Temática',
      'Formato',
      'Referencia URL',
      'Contexto',
      'Palabras clave',
      'Herramienta',
      ...votantes.map((v) => v.nombre)
    ];
    const sample = [
      '(EJEMPLO) 3 errores al empacar un pedido',
      'Primer bloque gancho.\nSegundo bloque desarrollo.\nCierre con llamado a la acción.',
      pilares[0] || 'E-commerce',
      'Logística',
      formatos[0] || 'Hablando a cámara',
      'https://...',
      'En oficina con caja de envío',
      'EMPAQUE',
      '',
      ...votantes.map(() => 5)
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ideas');
    XLSX.writeFile(wb, 'Plantilla_Ideas_ReelLab.xlsx');
    onNotify('Plantilla Excel descargada');
  };

  const handleCreateIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const targetLoteId =
        filterLote !== 'all' ? Number(filterLote) : mostRecentLote?.id ?? null;
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
    if (myVotes[ideaId] === stars) {
      await clearIdeaVoto(ideaId, activeUser.id);
      await loadAll();
      onNotify('Voto quitado');
      return;
    }
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
      calificada: true,
      estado: idea.estado === 'nueva' ? 'calificada' : idea.estado
    });
    await loadAll();
  };

  const handleSelectExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName =
        wb.SheetNames.find((n) => /^ideas$/i.test(n)) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const titleRe = /^(idea|t[ií]tulo|idea\s*\/\s*t[ií]tulo|idea central)/i;
      const headerIdx = matrix.findIndex((r) =>
        r.some((c) => titleRe.test(String(c).trim()))
      );
      if (headerIdx < 0) {
        onNotify('No encontré la columna «Idea / Título». Usa la plantilla.');
        return;
      }

      const headers = matrix[headerIdx].map((c) => String(c).trim());
      const findCol = (re: RegExp) => headers.findIndex((h) => re.test(h));
      const colTitulo = findCol(titleRe);
      const colTexto = findCol(/^(guion|texto base|guion\s*\/\s*texto base|descripci)/i);
      const colPilar = findCol(/^pilar/i);
      const colTematica = findCol(/^tem[aá]tica/i);
      const colFormato = findCol(/^formato/i);
      const colUrl = findCol(/^(referencia|link|url)/i);
      const colContexto = findCol(/^contexto/i);
      const colPalabras = findCol(/clave/i);
      const colHerramienta = findCol(/^herramienta/i);

      const votCols = votantes
        .map((v) => ({
          votante: v,
          idx: headers.findIndex((h) => h.toLowerCase() === v.nombre.toLowerCase())
        }))
        .filter((x) => x.idx >= 0);

      const preview: ExcelPreviewRow[] = [];
      for (const row of matrix.slice(headerIdx + 1)) {
        const cell = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
        const texto = cell(colTexto);
        let titulo = cell(colTitulo);
        if (!titulo && texto) titulo = texto.split(/\r?\n/)[0].slice(0, 120);
        if (!titulo || /^\(EJEMPLO/i.test(titulo)) continue;

        const votos: Array<[number, number]> = votCols
          .map(({ votante, idx }) => [votante.id, Number(row[idx])] as [number, number])
          .filter(([, score]) => score >= 1 && score <= 5);

        const similar = findSimilarIdeas(titulo, texto, ideas);
        preview.push({
          include: similar.length === 0,
          titulo,
          texto_base: texto,
          pilar: cell(colPilar),
          tematica: cell(colTematica),
          formato: cell(colFormato),
          referencia_url: cell(colUrl),
          contexto: cell(colContexto),
          palabras_clave: cell(colPalabras),
          herramienta: cell(colHerramienta),
          votos,
          similar
        });
      }

      if (preview.length === 0) {
        onNotify('El Excel no tiene filas válidas para importar');
        return;
      }

      setExcelFileName(file.name);
      setExcelRows(preview);
      setExcelTargetLote('nuevo');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo leer el Excel');
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelRows) return;
    const selected = excelRows.filter((r) => r.include);
    if (selected.length === 0) {
      onNotify('Marca al menos una idea para importar');
      return;
    }
    setImportingExcel(true);
    try {
      const loteId =
        excelTargetLote === 'nuevo' ? (await createLote()).id : Number(excelTargetLote);
      for (const row of selected) {
        const created = await createIdea({
          titulo: row.titulo,
          texto_base: row.texto_base,
          pilar: row.pilar || undefined,
          tematica: row.tematica || undefined,
          formato: row.formato || undefined,
          referencia_url: row.referencia_url || undefined,
          contexto: row.contexto || undefined,
          palabras_clave: row.palabras_clave || undefined,
          herramienta: row.herramienta || undefined,
          lote_id: loteId
        });
        for (const [votanteId, puntaje] of row.votos) {
          await saveIdeaVoto(created.id, votanteId, puntaje);
        }
      }
      setExcelRows(null);
      setFilterLote(String(loteId));
      await loadAll();
      onNotify(`${selected.length} ideas importadas`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al importar Excel');
    } finally {
      setImportingExcel(false);
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

  const handleRescueIdea = async (idea: IdeaConPuntaje) => {
    if (!mostRecentLote) return;
    try {
      await rescueIdeaToLote(idea, mostRecentLote.id);
      await loadAll();
      onNotify(`Idea rescatada en ${mostRecentLote.nombre}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo rescatar');
    }
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          <strong>Falta instalar las tablas de ReelLab en Supabase</strong>
          <p style={{ margin: '6px 0 0' }}>
            Abre el <strong>SQL Editor</strong> de tu proyecto Supabase y ejecuta el esquema
            correspondiente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">Banco de Ideas ({filteredIdeas.length})</h2>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {onOpenProcess && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenProcess}
              title="Guía paso a paso del proceso viral"
            >
              <BookOpen size={15} color="#38bdf8" />
              Proceso
            </button>
          )}
          {onGoScripts && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onGoScripts}
            >
              <Clapperboard size={15} color="#a78bfa" />
              Guiones
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadTemplate}
            title="Descargar plantilla Excel"
          >
            <Download size={15} />
            Plantilla
          </button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <FileSpreadsheet size={15} color="#34d399" />
            Subir Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => void handleSelectExcelFile(e)}
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

          {similarToNew.length > 0 && (
            <div className="alert warning" style={{ fontSize: '0.84rem' }}>
              <strong>Se parece a ideas ya escritas:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {similarToNew.map((sim) => (
                  <li key={sim.id}>
                    #{sim.numero ?? sim.id} «{sim.titulo}» ({sim.lote_nombre || 'Sin lote'})
                  </li>
                ))}
              </ul>
            </div>
          )}

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

      {/* Filters & Sort */}
      <div className="card" style={{ gap: 8, padding: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px' }}
            placeholder="Buscar idea, texto o palabra clave..."
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

        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <select
            className="select"
            style={{ flex: 1, minWidth: 110, padding: '6px 8px', fontSize: '0.82rem' }}
            value={filterPilar}
            onChange={(e) => setFilterPilar(e.target.value)}
          >
            <option value="all">Pilar: Todos</option>
            {pilares.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ flex: 1, minWidth: 110, padding: '6px 8px', fontSize: '0.82rem' }}
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
          >
            <option value="all">Estado: Todos</option>
            {Object.entries(ESTADOS_LABEL).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ flex: 1, minWidth: 120, padding: '6px 8px', fontSize: '0.82rem' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="voto">Orden: Voto equipo</option>
            <option value="puntaje">Orden: Calculadora</option>
            <option value="numero">Orden: Número</option>
            <option value="reciente">Orden: Recientes</option>
          </select>
          <label className="row muted" style={{ gap: 4, fontSize: '0.8rem' }}>
            Umbral:
            <input
              className="input"
              type="number"
              step="0.5"
              min={0}
              style={{ width: 62, padding: '5px 6px', fontSize: '0.82rem' }}
              value={umbral}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setUmbral(v);
                try {
                  localStorage.setItem(UMBRAL_STORAGE_KEY, String(v));
                } catch {
                  // ignore
                }
              }}
            />
          </label>
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
            const ideaVotes = votesByIdea.get(idea.id) || [];
            const isTop =
              idea.calificada &&
              Number(idea.puntaje_total || 0) >= umbral &&
              idea.estado !== 'descartada';
            const suggestedLevel = suggestAwarenessLevel(idea);
            const canRescue =
              mostRecentLote &&
              idea.lote_id !== mostRecentLote.id &&
              idea.estado !== 'en_guion' &&
              !idea.guion_id;

            return (
              <div
                key={idea.id}
                className="card"
                style={{
                  gap: 10,
                  borderColor: isTop ? 'rgba(52, 211, 153, 0.5)' : undefined
                }}
              >
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                  >
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                      {idea.numero != null && <span className="badge">#{idea.numero}</span>}
                      {idea.pilar && <span className="badge">{idea.pilar}</span>}
                      {idea.formato && <span className="badge libreto">{idea.formato}</span>}
                      <span className="badge estructura">
                        <Flame size={12} />
                        {Number(idea.puntaje_total || 0).toFixed(1)} pts
                      </span>
                      {idea.voto_promedio != null && (
                        <span className="badge notas">
                          ★ {idea.voto_promedio} ({idea.votos})
                        </span>
                      )}
                      {idea.guion_id ? (
                        <span className="badge">Con Guion</span>
                      ) : (
                        <span className="badge">{ESTADOS_LABEL[idea.estado] || idea.estado}</span>
                      )}
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

                {/* Team votes indicator */}
                {votantes.length > 0 && (
                  <div className="row" style={{ gap: 6, fontSize: '0.76rem' }}>
                    <div className="row" style={{ gap: 4 }}>
                      {votantes.map((vt) => {
                        const voted = ideaVotes.some((v) => v.votante_id === vt.id);
                        return (
                          <span
                            key={vt.id}
                            title={`${vt.nombre}: ${voted ? 'votó' : 'falta'}`}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: voted ? '#34d399' : '#334155',
                              border:
                                activeUser?.id === vt.id ? '1.5px solid #38bdf8' : 'none'
                            }}
                          />
                        );
                      })}
                    </div>
                    <span className="muted">
                      {ideaVotes.length}/{votantes.length} del equipo
                    </span>
                  </div>
                )}

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
                        <Star size={20} fill={star <= userVote ? '#fbbf24' : 'none'} />
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
                      <label>Calculadora de Viralidad</label>
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

                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <div className="field" style={{ flex: 1, minWidth: 160 }}>
                        <div className="row-between">
                          <label>Nivel de conciencia (0–4)</label>
                          {suggestedLevel != null && idea.nivel_conciencia !== suggestedLevel && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ minHeight: 24, padding: '2px 6px', fontSize: '0.75rem' }}
                              onClick={() =>
                                void updateIdea(idea.id, {
                                  nivel_conciencia: suggestedLevel
                                }).then(loadAll)
                              }
                            >
                              Aplicar sugerido ({suggestedLevel})
                            </button>
                          )}
                        </div>
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

                      <div className="field" style={{ flex: 1, minWidth: 140 }}>
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

                    <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>
                        {idea.lote_nombre || 'Sin lote'}
                      </span>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {canRescue && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handleRescueIdea(idea)}
                          >
                            <RotateCcw size={14} />
                            Rescatar a lote actual
                          </button>
                        )}
                        {idea.estado !== 'en_espera' && !idea.guion_id && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              void updateIdea(idea.id, { estado: 'en_espera' }).then(loadAll)
                            }
                          >
                            En espera
                          </button>
                        )}
                        {idea.estado !== 'descartada' && !idea.guion_id && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              void updateIdea(idea.id, { estado: 'descartada' }).then(loadAll)
                            }
                          >
                            Descartar
                          </button>
                        )}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {excelRows && (
        <div className="storyboard-overlay">
          <div className="storyboard-container" style={{ maxWidth: 720 }}>
            <div className="row-between">
              <div>
                <strong>Vista previa de Excel: {excelFileName}</strong>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {excelRows.length} ideas detectadas ·{' '}
                  {excelRows.filter((r) => r.similar.length > 0).length} parecidas a existentes
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setExcelRows(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="field">
              <label>Lote de destino</label>
              <select
                className="select"
                value={excelTargetLote}
                onChange={(e) => setExcelTargetLote(e.target.value)}
              >
                <option value="nuevo">+ Crear lote nuevo para esta carga</option>
                {lotes.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {excelRows.map((row, idx) => (
                <label
                  key={idx}
                  className="card"
                  style={{
                    padding: 10,
                    gap: 4,
                    cursor: 'pointer',
                    borderColor: row.similar.length > 0 ? 'rgba(251, 191, 36, 0.5)' : undefined
                  }}
                >
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) =>
                        setExcelRows((prev) =>
                          prev
                            ? prev.map((item, i) =>
                                i === idx ? { ...item, include: e.target.checked } : item
                              )
                            : null
                        )
                      }
                    />
                    <strong style={{ flex: 1, fontSize: '0.92rem' }}>{row.titulo}</strong>
                    {row.votos.length > 0 && (
                      <span className="badge notas">{row.votos.length} votos</span>
                    )}
                  </div>
                  {(row.pilar || row.tematica) && (
                    <span className="muted" style={{ fontSize: '0.78rem', paddingLeft: 24 }}>
                      {[row.pilar, row.tematica, row.formato].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {row.similar.length > 0 && (
                    <div className="muted" style={{ fontSize: '0.78rem', color: '#fbbf24', paddingLeft: 24 }}>
                      Se parece a: {row.similar.map((s) => `«${s.titulo}»`).join(', ')}
                    </div>
                  )}
                </label>
              ))}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExcelRows(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={importingExcel}
                onClick={() => void handleConfirmExcelImport()}
              >
                {importingExcel
                  ? 'Importando...'
                  : `Subir ${excelRows.filter((r) => r.include).length} ideas`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
