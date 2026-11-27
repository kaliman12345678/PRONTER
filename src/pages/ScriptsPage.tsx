import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import {
  assignPiezaToGuion,
  createGuionFromIdea,
  deleteGuion,
  estimateWordStats,
  fetchBloquesByGuion,
  fetchCatalogos,
  fetchGanchoTipos,
  fetchGuiones,
  fetchIdeas,
  fetchPiezasGanchoCta,
  fetchSketchBank,
  saveAllBloques,
  updateGuionEstado,
  updateGuionMeta,
  uploadSketchImage
} from '../db/reellabService';
import {
  completeStoryboardWithAI,
  generateScriptExpertWithAI,
  getActiveProviderLabel,
  getAIConfig,
  type AIGenerationMeta
} from '../services/aiGenerator';
import type { ScriptBlock } from '../types/models';
import type {
  BloqueStoryboard,
  BloqueTipo,
  CatalogoItem,
  GanchoTipo,
  GuionEstado,
  GuionResumen,
  IdeaConPuntaje,
  PiezaResumen,
  SketchBankItem
} from '../types/reellab';
import { copyToClipboard } from '../utils/clipboard';
import { countWords } from '../utils/hookScorer';

interface Props {
  initialEditGuionId?: number | null;
  onClearInitialEdit?: () => void;
  onOpenStoryboard: (guion: GuionResumen) => void;
  onOpenTeleprompter: (title: string, blocks: ScriptBlock[]) => void;
  onNotify: (msg: string) => void;
  schemaMissing: boolean;
}

const ESTADOS_ORDER: GuionEstado[] = [
  'pendiente',
  'guion_listo',
  'grabado',
  'editado',
  'publicado'
];

const ESTADOS_LABEL: Record<GuionEstado, string> = {
  pendiente: 'Pendiente',
  guion_listo: 'Guion listo',
  grabado: 'Grabado',
  editado: 'Editado',
  publicado: 'Publicado'
};

const BLOQUE_TIPOS: { value: BloqueTipo; label: string }[] = [
  { value: 'gancho', label: 'Gancho' },
  { value: 'historia', label: 'Historia' },
  { value: 'moraleja', label: 'Moraleja' },
  { value: 'moraleja_cta', label: 'Moraleja / CTA' },
  { value: 'cta', label: 'CTA' }
];

const PLANOS_SUGERIDOS = [
  'Medio frontal',
  'Medio corto (frontal)',
  'Medio (3/4)',
  'Medio + B-roll',
  'Medio + insertos',
  'Medio (detalle del celular)',
  'Cercano (directo a cámara)'
];

const CAMARAS_SUGERIDAS = [
  'Estática',
  'Estática / B-roll',
  'Estática / leve acercamiento'
];

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const SKETCH_STYLE_PREFIX =
  'Boceto de storyboard a lápiz: grafito en blanco y negro sobre papel blanco, trazo limpio con sombreado suave, formato horizontal 3:2, sin colores. El presentador con camiseta oscura en el lugar de la escena. Si hay texto visible, que sea corto y en español. Escena: ';

const COLLAPSED_MONTHS_KEY = 'pronter-guiones-meses-plegados-v1';

function getMonthGroup(g: GuionResumen): { key: string; label: string } {
  const d = g.creado_en ? new Date(g.creado_en) : null;
  if (!d || Number.isNaN(d.getTime())) return { key: '0000-00', label: 'Sin fecha' };
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  return { key, label };
}

export function ScriptsPage({
  initialEditGuionId,
  onClearInitialEdit,
  onOpenStoryboard,
  onOpenTeleprompter,
  onNotify,
  schemaMissing
}: Props) {
  const [guiones, setGuiones] = useState<GuionResumen[]>([]);
  const [ideas, setIdeas] = useState<IdeaConPuntaje[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoItem[]>([]);
  const [piezas, setPiezas] = useState<PiezaResumen[]>([]);
  const [ganchoTipos, setGanchoTipos] = useState<GanchoTipo[]>([]);
  const [loading, setLoading] = useState(true);

  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_MONTHS_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  // New guion modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>('');

  // Editor state
  const [editingGuion, setEditingGuion] = useState<GuionResumen | null>(null);
  const [escenas, setEscenas] = useState<BloqueStoryboard[]>([]);
  const [saving, setSaving] = useState(false);

  // Editable metadata fields
  const [titulo, setTitulo] = useState('');
  const [numero, setNumero] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [estado, setEstado] = useState<GuionEstado>('pendiente');
  const [duracionMax, setDuracionMax] = useState(60);
  const [formatoGrab, setFormatoGrab] = useState('');
  const [locacion, setLocacion] = useState('');
  const [iluminacion, setIluminacion] = useState('');
  const [tono, setTono] = useState('');
  const [ganchosAlt, setGanchosAlt] = useState('');
  const [notas, setNotas] = useState('');

  // Sketch bank modal
  const [sketchBankTargetIdx, setSketchBankTargetIdx] = useState<number | null>(null);
  const [sketchBank, setSketchBank] = useState<SketchBankItem[]>([]);
  const [sketchSearch, setSketchSearch] = useState('');

  // AI script & storyboard generation
  const [aiBusy, setAiBusy] = useState<'script' | 'storyboard' | null>(null);
  const [aiMeta, setAiMeta] = useState<AIGenerationMeta | null>(null);
  const [aiUseTrends, setAiUseTrends] = useState(() => getAIConfig().useTrendsSearch);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [gList, iList, cList, pList, tiposList] = await Promise.all([
        fetchGuiones(),
        fetchIdeas(),
        fetchCatalogos(),
        fetchPiezasGanchoCta(),
        fetchGanchoTipos()
      ]);
      setGuiones(gList);
      setIdeas(iList);
      setCatalogos(cList);
      setPiezas(pList);
      setGanchoTipos(tiposList);
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
  }, [schemaMissing]);

  const openEditor = async (g: GuionResumen) => {
    setEditingGuion(g);
    setTitulo(g.titulo || '');
    setNumero(g.numero != null ? String(g.numero) : '');
    setObjetivo(g.objetivo || '');
    setEstado(g.estado || 'pendiente');
    setDuracionMax(g.duracion_max_s || 60);
    setFormatoGrab(g.formato_grabacion || '');
    setLocacion(g.locacion || '');
    setIluminacion(g.iluminacion || '');
    setTono(g.tono || '');
    setGanchosAlt((g.ganchos_alternativos || []).join('\n'));
    setNotas((g.notas || []).join('\n'));
    const list = await fetchBloquesByGuion(g.id);
    setEscenas(list.map((b) => ({ ...b, edicion: b.edicion || [] })));
  };

  useEffect(() => {
    if (initialEditGuionId && guiones.length > 0) {
      const target = guiones.find((g) => g.id === initialEditGuionId);
      if (target) {
        void openEditor(target);
      }
      onClearInitialEdit?.();
    }
  }, [initialEditGuionId, guiones]);

  const objetivos = useMemo(
    () => catalogos.filter((c) => c.tipo === 'objetivo').map((c) => c.valor),
    [catalogos]
  );

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: GuionResumen[] }>();
    for (const g of guiones) {
      const grp = getMonthGroup(g);
      if (!map.has(grp.key)) map.set(grp.key, { ...grp, items: [] });
      map.get(grp.key)!.items.push(g);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [guiones]);

  const availableIdeasForNew = useMemo(
    () =>
      ideas
        .filter((i) => i.estado !== 'descartada' && i.estado !== 'en_guion' && i.guion_id == null)
        .sort(
          (a, b) =>
            Number(b.estado === 'aprobada') - Number(a.estado === 'aprobada') ||
            b.puntaje_total - a.puntaje_total
        ),
    [ideas]
  );

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_MONTHS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleQuickEstado = async (g: GuionResumen, nextEstado: GuionEstado) => {
    try {
      await updateGuionEstado(g.id, nextEstado);
      setGuiones((prev) =>
        prev.map((item) => (item.id === g.id ? { ...item, estado: nextEstado } : item))
      );
      onNotify(`Estado: ${ESTADOS_LABEL[nextEstado]}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    }
  };

  const handleCreateGuion = async (e: React.FormEvent) => {
    e.preventDefault();
    const idea = availableIdeasForNew.find((i) => String(i.id) === selectedIdeaId);
    if (!idea) return;
    try {
      const created = await createGuionFromIdea(idea);
      setShowNewModal(false);
      await loadAll();
      await openEditor(created);
      onNotify('Guion creado. Revisa cómo quedó repartido en las escenas.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo crear el guion');
    }
  };

  const handleSaveEditor = async (silent = false): Promise<boolean> => {
    if (!editingGuion) return false;
    if (!titulo.trim()) {
      onNotify('Escribe un título para el guion');
      return false;
    }
    setSaving(true);
    try {
      const toLines = (s: string) =>
        s
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);

      await updateGuionMeta(editingGuion.id, {
        titulo: titulo.trim(),
        numero: numero.trim() ? Number(numero) : null,
        objetivo: objetivo || null,
        estado,
        duracion_max_s: duracionMax || 60,
        formato_grabacion: formatoGrab.trim() || '1 toma en oficina + edición',
        locacion: locacion.trim() || null,
        iluminacion: iluminacion.trim() || null,
        tono: tono.trim() || null,
        ganchos_alternativos: toLines(ganchosAlt),
        notas: toLines(notas)
      });

      const savedBloques = await saveAllBloques(editingGuion.id, escenas);
      setEscenas(savedBloques.map((b) => ({ ...b, edicion: b.edicion || [] })));
      await loadAll();
      if (!silent) onNotify('Guion guardado');
      return true;
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al guardar el guion');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGuion = async () => {
    if (!editingGuion) return;
    if (
      !window.confirm(
        `¿Eliminar el guion «${editingGuion.titulo}» y todas sus escenas? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      await deleteGuion(editingGuion.id);
      setEditingGuion(null);
      await loadAll();
      onNotify('Guion eliminado');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  const handleMoveScene = (idx: number, delta: number) => {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= escenas.length) return;
    setEscenas((prev) => {
      const copy = [...prev];
      [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
      return copy;
    });
  };

  const handleAddScene = () => {
    const last = escenas[escenas.length - 1];
    setEscenas((prev) => [
      ...prev,
      {
        id: -Date.now(),
        guion_id: editingGuion!.id,
        orden: prev.length + 1,
        tipo: 'historia',
        inicio_s: last?.fin_s ?? 0,
        fin_s: null,
        dialogo: '',
        texto_pantalla: '',
        plano: 'Medio corto (frontal)',
        camara: 'Estática',
        edicion: [],
        grabado: false,
        exportado: false
      }
    ]);
  };

  const handleUploadSceneSketch = async (idx: number, file: File) => {
    if (!editingGuion) return;
    try {
      onNotify('Subiendo sketch...');
      const url = await uploadSketchImage(editingGuion.id, file);
      setEscenas((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, sketch_url: url } : item))
      );
      onNotify('Sketch subido. Recuerda guardar el guion.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al subir imagen');
    }
  };

  const handleOpenSketchBank = async (idx: number) => {
    setSketchBankTargetIdx(idx);
    setSketchSearch('');
    const bank = await fetchSketchBank();
    setSketchBank(bank);
  };

  const handleAssignHookOrCta = async (clase: 'gancho' | 'cta', piezaIdStr: string) => {
    if (!editingGuion || !piezaIdStr) return;
    const pieza = piezas.find((p) => p.id === Number(piezaIdStr));
    if (!pieza) return;
    const copyToScene = window.confirm(
      `¿Copiar también el texto de este ${clase === 'gancho' ? 'gancho' : 'CTA'} a la escena del guion?`
    );
    try {
      await assignPiezaToGuion(pieza, editingGuion.id, copyToScene);
      await loadAll();
      if (copyToScene) {
        const refreshed = await fetchBloquesByGuion(editingGuion.id);
        setEscenas(refreshed.map((b) => ({ ...b, edicion: b.edicion || [] })));
      }
      setEditingGuion((prev) =>
        prev
          ? {
              ...prev,
              [clase === 'gancho' ? 'gancho_id' : 'cta_id']: pieza.id
            }
          : null
      );
      onNotify(`${clase === 'gancho' ? 'Gancho' : 'CTA'} asignado al guion`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al asignar');
    }
  };

  const handleGenerateScriptAI = async () => {
    if (!editingGuion) return;
    if (
      escenas.some((s) => s.dialogo.trim()) &&
      !window.confirm('Esto reemplazará los diálogos actuales de las escenas con una versión generada por IA. ¿Continuar?')
    ) {
      return;
    }
    setAiBusy('script');
    try {
      const originIdea = ideas.find((i) => i.id === editingGuion.idea_id);
      const res = await generateScriptExpertWithAI({
        titulo: titulo || editingGuion.titulo,
        textoBase: originIdea?.texto_base || undefined,
        pilar: editingGuion.pilar || undefined,
        formato: editingGuion.formato || undefined,
        objetivo: objetivo || undefined,
        duracionSegundos: duracionMax,
        tono: tono || undefined,
        hookTypes: ganchoTipos,
        useTrendsOverride: aiUseTrends
      });
      const baseTs = Date.now();
      setEscenas(
        res.bloques.map((b, idx) => ({
          id: -(baseTs + idx),
          guion_id: editingGuion.id,
          orden: idx + 1,
          tipo: b.tipo || 'historia',
          inicio_s: b.inicio_s ?? null,
          fin_s: b.fin_s ?? null,
          dialogo: b.dialogo || '',
          texto_pantalla: b.texto_pantalla || '',
          plano: b.plano || 'Medio corto (frontal)',
          camara: b.camara || 'Estática',
          edicion: Array.isArray(b.edicion) ? b.edicion : [],
          sketch_texto: b.indicaciones || null,
          sketch_prompt: b.sketch_prompt || null,
          grabado: false,
          exportado: false
        }))
      );
      setAiMeta(res.meta);
      onNotify(`Guion generado con ${res.meta.providerLabel}. Recuerda guardar.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo generar el guion con IA');
    } finally {
      setAiBusy(null);
    }
  };

  const handleCompleteStoryboardAI = async () => {
    if (!editingGuion || escenas.length === 0) return;
    setAiBusy('storyboard');
    try {
      const res = await completeStoryboardWithAI({
        titulo: titulo || editingGuion.titulo,
        escenas,
        objetivo,
        tono
      });
      setEscenas((prev) =>
        prev.map((esc, idx) => {
          const upd = res.updates.find((u) => u.orden === idx + 1) || res.updates[idx];
          if (!upd) return esc;
          return {
            ...esc,
            plano: upd.plano || esc.plano,
            camara: upd.camara || esc.camara,
            edicion: upd.edicion?.length ? upd.edicion : esc.edicion,
            texto_pantalla: upd.texto_pantalla || esc.texto_pantalla,
            sketch_texto: upd.sketch_texto || esc.sketch_texto,
            sketch_prompt: upd.sketch_prompt || esc.sketch_prompt
          };
        })
      );
      onNotify(`Storyboard completado con ${res.meta.providerLabel}. Recuerda guardar.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo completar el storyboard');
    } finally {
      setAiBusy(null);
    }
  };

  const launchTeleprompter = () => {
    const tpBlocks: ScriptBlock[] = escenas
      .filter((b) => b.dialogo.trim() || b.texto_pantalla.trim())
      .map((b, i) => ({
        id: `tp-sc-${i}-${b.id}`,
        title: `${b.inicio_s ?? 0}–${b.fin_s ?? 0}s · ${b.tipo.toUpperCase()}`,
        text: b.dialogo.trim() || b.texto_pantalla.trim(),
        cues: [
          b.plano ? `Plano: ${b.plano}` : '',
          b.camara ? `Cámara: ${b.camara}` : '',
          b.texto_pantalla ? `En pantalla: ${b.texto_pantalla}` : '',
          b.sketch_texto ? `Nota: ${b.sketch_texto}` : ''
        ]
          .filter(Boolean)
          .join(' · ')
      }));

    if (tpBlocks.length === 0) {
      onNotify('Escribe diálogo en al menos una escena primero');
      return;
    }
    onOpenTeleprompter(titulo || editingGuion?.titulo || 'Guion', tpBlocks);
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          Ejecuta el esquema de ReelLab en Supabase para administrar guiones y storyboards.
        </div>
      </div>
    );
  }

  // ==================== EDITOR VIEW ====================
  if (editingGuion) {
    const stats = estimateWordStats(escenas);
    const currentGancho = piezas.find((p) => p.id === editingGuion.gancho_id);
    const currentCta = piezas.find((p) => p.id === editingGuion.cta_id);
    const ganchoOptions = piezas.filter(
      (p) =>
        p.clase === 'gancho' &&
        p.estado !== 'descartado' &&
        (p.estado === 'potencial' || p.guion_id === editingGuion.id || p.id === editingGuion.gancho_id)
    );
    const ctaOptions = piezas.filter(
      (p) =>
        p.clase === 'cta' &&
        p.estado !== 'descartado' &&
        (p.estado === 'potencial' || p.guion_id === editingGuion.id || p.id === editingGuion.cta_id)
    );

    return (
      <div className="page-content">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditingGuion(null)}
          >
            <ArrowLeft size={16} />
            Todos los guiones
          </button>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span
              className={`badge ${stats.seconds > duracionMax ? 'notas' : ''}`}
              title="Curso recomienda 50–60 s"
            >
              {stats.words} pal. · ≈{stats.seconds}s / {duracionMax}s
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={launchTeleprompter}
            >
              <Play size={15} fill="currentColor" />
              Teleprompter
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                if (await handleSaveEditor(true)) {
                  onOpenStoryboard({ ...editingGuion, titulo, estado });
                }
              }}
            >
              <Clapperboard size={15} />
              Storyboard
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void handleSaveEditor(false)}
            >
              <Save size={15} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* AI Script & Storyboard Generator */}
        <div className="card" style={{ gap: 8, padding: 12 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <Sparkles size={16} color="#a78bfa" />
              <strong style={{ fontSize: '0.92rem' }}>Asistente IA de Guion y Storyboard</strong>
            </div>
            <span className="badge estructura">{getActiveProviderLabel()}</span>
          </div>
          {getAIConfig().provider === 'gemini' && (
            <label className="row" style={{ gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiUseTrends}
                onChange={(e) => setAiUseTrends(e.target.checked)}
              />
              Consultar tendencias y memes en Google antes de redactar
            </label>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={aiBusy !== null}
              onClick={() => void handleGenerateScriptAI()}
            >
              <Sparkles size={14} color="#a78bfa" />
              {aiBusy === 'script' ? 'Redactando guion...' : 'Redactar guion con IA'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={aiBusy !== null || escenas.length === 0}
              onClick={() => void handleCompleteStoryboardAI()}
            >
              <Clapperboard size={14} color="#38bdf8" />
              {aiBusy === 'storyboard' ? 'Completando storyboard...' : 'Completar Storyboard con IA'}
            </button>
          </div>
          {aiMeta && (aiMeta.trendSummary || aiMeta.sources.length > 0) && (
            <div style={{ background: 'var(--bg-input)', padding: 10, borderRadius: 8, fontSize: '0.82rem' }}>
              <strong>Tendencias consultadas:</strong>
              {aiMeta.trendSummary && (
                <p className="muted" style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                  {aiMeta.trendSummary}
                </p>
              )}
              {aiMeta.sources.length > 0 && (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {aiMeta.sources.slice(0, 4).map((s, si) => (
                    <a
                      key={si}
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="badge"
                      style={{ textDecoration: 'none' }}
                    >
                      {s.title.slice(0, 30)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata Card */}
        <div className="card">
          <div className="row-between">
            <strong>Datos del guion</strong>
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              {[editingGuion.pilar, editingGuion.tematica, editingGuion.formato]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Título</label>
              <input
                className="input"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Número</label>
              <input
                className="input"
                type="number"
                min={1}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Estado</label>
              <select
                className="select"
                value={estado}
                onChange={(e) => setEstado(e.target.value as GuionEstado)}
              >
                {ESTADOS_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {ESTADOS_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Duración máxima</label>
              <select
                className="select"
                value={duracionMax}
                onChange={(e) => setDuracionMax(Number(e.target.value))}
              >
                <option value={30}>30 s</option>
                <option value={45}>45 s</option>
                <option value={60}>60 s</option>
                <option value={70}>70 s</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Objetivo</label>
              <select
                className="select"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
              >
                <option value="">—</option>
                {objetivos.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Formato de grabación</label>
              <input
                className="input"
                placeholder="1 toma en oficina + edición"
                value={formatoGrab}
                onChange={(e) => setFormatoGrab(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Locación</label>
              <input
                className="input"
                value={locacion}
                onChange={(e) => setLocacion(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Iluminación</label>
              <input
                className="input"
                value={iluminacion}
                onChange={(e) => setIluminacion(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>Tono</label>
            <input className="input" value={tono} onChange={(e) => setTono(e.target.value)} />
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Ganchos alternativos (uno por línea)</label>
              <textarea
                className="textarea"
                rows={2}
                value={ganchosAlt}
                onChange={(e) => setGanchosAlt(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Notas de producción (una por línea)</label>
              <textarea
                className="textarea"
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Gancho y CTA asignados */}
        <div className="card">
          <strong>Gancho y CTA del guion</strong>
          <div className="grid-2">
            <div className="gc-box">
              <div className="row-between">
                <span className="badge">Gancho</span>
                {currentGancho?.tipo_nombre && (
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {currentGancho.tipo_nombre}
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0', fontSize: '0.88rem' }}>
                {currentGancho ? `«${currentGancho.texto}»` : 'Sin elegir todavía'}
              </p>
              <select
                className="select"
                value=""
                onChange={(e) => void handleAssignHookOrCta('gancho', e.target.value)}
              >
                <option value="">
                  {currentGancho ? 'Cambiar gancho del banco...' : 'Elegir gancho del banco...'}
                </option>
                {ganchoOptions
                  .filter((p) => p.id !== editingGuion.gancho_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.voto_promedio != null ? `★${p.voto_promedio.toFixed(1)} · ` : ''}
                      {p.texto.slice(0, 75)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="gc-box">
              <div className="row-between">
                <span className="badge notas">CTA</span>
                {currentCta?.objetivo && (
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {currentCta.objetivo}
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0', fontSize: '0.88rem' }}>
                {currentCta ? `«${currentCta.texto}»` : 'Sin elegir todavía'}
              </p>
              <select
                className="select"
                value=""
                onChange={(e) => void handleAssignHookOrCta('cta', e.target.value)}
              >
                <option value="">
                  {currentCta ? 'Cambiar CTA del banco...' : 'Elegir CTA del banco...'}
                </option>
                {ctaOptions
                  .filter((p) => p.id !== editingGuion.cta_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.voto_promedio != null ? `★${p.voto_promedio.toFixed(1)} · ` : ''}
                      {p.texto.slice(0, 75)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Escenas */}
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Escenas ({escenas.length})</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddScene}>
            <Plus size={15} />
            Agregar escena
          </button>
        </div>

        {escenas.map((esc, idx) => {
          const words = countWords(esc.dialogo);
          const secs = Math.round(words / 3);
          const updateScene = (patch: Partial<BloqueStoryboard>) => {
            setEscenas((prev) =>
              prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
            );
          };
          const promptText =
            SKETCH_STYLE_PREFIX +
            (esc.sketch_prompt || esc.dialogo || '') +
            (esc.plano ? ` Plano: ${esc.plano}.` : '') +
            (esc.texto_pantalla ? ` Texto visible: «${esc.texto_pantalla.trim()}».` : '');

          return (
            <div key={`${esc.id}-${idx}`} className="card" style={{ gap: 10 }}>
              <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">Escena {String(idx + 1).padStart(2, '0')}</span>
                  <select
                    className="select"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.84rem' }}
                    value={esc.tipo}
                    onChange={(e) => updateScene({ tipo: e.target.value as BloqueTipo })}
                  >
                    {BLOQUE_TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="row" style={{ gap: 4 }}>
                    <input
                      className="input"
                      type="number"
                      step="0.5"
                      min={0}
                      placeholder="ini"
                      style={{ width: 64, padding: '4px 6px', fontSize: '0.82rem' }}
                      value={esc.inicio_s ?? ''}
                      onChange={(e) =>
                        updateScene({
                          inicio_s: e.target.value === '' ? null : Number(e.target.value)
                        })
                      }
                    />
                    <span>–</span>
                    <input
                      className="input"
                      type="number"
                      step="0.5"
                      min={0}
                      placeholder="fin"
                      style={{ width: 64, padding: '4px 6px', fontSize: '0.82rem' }}
                      value={esc.fin_s ?? ''}
                      onChange={(e) =>
                        updateScene({
                          fin_s: e.target.value === '' ? null : Number(e.target.value)
                        })
                      }
                    />
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      s
                    </span>
                  </div>
                </div>

                <div className="row" style={{ gap: 4 }}>
                  <label className="row" style={{ gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={esc.grabado}
                      onChange={(e) => updateScene({ grabado: e.target.checked })}
                    />
                    Grabado
                  </label>
                  <label className="row" style={{ gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={esc.exportado}
                      onChange={(e) => updateScene({ exportado: e.target.checked })}
                    />
                    Exportado
                  </label>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    title="Subir escena"
                    disabled={idx === 0}
                    onClick={() => handleMoveScene(idx, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    title="Bajar escena"
                    disabled={idx === escenas.length - 1}
                    onClick={() => handleMoveScene(idx, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    title="Quitar escena"
                    onClick={() => {
                      if (window.confirm('¿Quitar esta escena?')) {
                        setEscenas((prev) => prev.filter((_, i) => i !== idx));
                      }
                    }}
                  >
                    <Trash2 size={14} color="#f87171" />
                  </button>
                </div>
              </div>

              <div className="field">
                <div className="row-between">
                  <label>Diálogo / voz en cámara</label>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {words} palabras · ≈{secs} s
                  </span>
                </div>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="Lo que dice el presentador"
                  value={esc.dialogo}
                  onChange={(e) => updateScene({ dialogo: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Texto en pantalla (ej. 0:04 10 PEDIDOS)</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={esc.texto_pantalla}
                  onChange={(e) => updateScene({ texto_pantalla: e.target.value })}
                />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Plano</label>
                  <input
                    className="input"
                    list="dl-planos"
                    value={esc.plano || ''}
                    onChange={(e) => updateScene({ plano: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Cámara</label>
                  <input
                    className="input"
                    list="dl-camaras"
                    value={esc.camara || ''}
                    onChange={(e) => updateScene({ camara: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Indicaciones de edición (una por línea)</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={(esc.edicion || []).join('\n')}
                  onChange={(e) =>
                    updateScene({
                      edicion: e.target.value
                        .split(/\r?\n/)
                        .map((x) => x.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </div>

              {/* Sketch section */}
              <div
                style={{
                  background: 'var(--bg-input)',
                  padding: 10,
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Sketch visual</span>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <ImagePlus size={14} />
                      Subir imagen
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleUploadSceneSketch(idx, f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleOpenSketchBank(idx)}
                    >
                      <ImageIcon size={14} />
                      Del banco
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        void copyToClipboard(promptText).then((ok) =>
                          onNotify(ok ? 'Prompt de sketch copiado' : 'No se pudo copiar')
                        )
                      }
                    >
                      <Copy size={14} />
                      Copiar prompt IA
                    </button>
                  </div>
                </div>

                {esc.sketch_url && (
                  <img
                    src={esc.sketch_url}
                    alt={`Sketch escena ${idx + 1}`}
                    style={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 8,
                      background: '#fff'
                    }}
                  />
                )}

                <input
                  className="input"
                  placeholder="URL del sketch (opcional)"
                  value={esc.sketch_url || ''}
                  onChange={(e) => updateScene({ sketch_url: e.target.value.trim() || null })}
                />
                <input
                  className="input"
                  placeholder="Nota o texto junto al sketch (opcional)"
                  value={esc.sketch_texto || ''}
                  onChange={(e) => updateScene({ sketch_texto: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Prompt personalizado del sketch (opcional)"
                  value={esc.sketch_prompt || ''}
                  onChange={(e) => updateScene({ sketch_prompt: e.target.value })}
                />
              </div>
            </div>
          );
        })}

        <div className="row-between" style={{ paddingTop: 6 }}>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => void handleDeleteGuion()}>
            <Trash2 size={15} />
            Eliminar guion
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void handleSaveEditor(false)}
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        <datalist id="dl-planos">
          {PLANOS_SUGERIDOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="dl-camaras">
          {CAMARAS_SUGERIDAS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {/* Sketch Bank Modal */}
        {sketchBankTargetIdx !== null && (
          <div className="storyboard-overlay">
            <div className="storyboard-container" style={{ maxWidth: 680 }}>
              <div className="row-between">
                <strong>Banco de sketches ({sketchBank.length})</strong>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSketchBankTargetIdx(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <input
                className="input"
                placeholder="Buscar por diálogo o plano..."
                value={sketchSearch}
                onChange={(e) => setSketchSearch(e.target.value)}
              />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 10,
                  maxHeight: '60vh',
                  overflowY: 'auto'
                }}
              >
                {sketchBank
                  .filter((b) => {
                    if (!sketchSearch.trim()) return true;
                    const q = sketchSearch.toLowerCase();
                    return `${b.dialogo} ${b.plano || ''} ${b.tipo}`.toLowerCase().includes(q);
                  })
                  .map((b, i) => (
                    <button
                      key={`${b.sketch_url}-${i}`}
                      type="button"
                      className="card"
                      style={{ padding: 8, textAlign: 'left', gap: 6 }}
                      onClick={() => {
                        setEscenas((prev) =>
                          prev.map((item, idx) =>
                            idx === sketchBankTargetIdx
                              ? { ...item, sketch_url: b.sketch_url }
                              : item
                          )
                        );
                        setSketchBankTargetIdx(null);
                        onNotify('Sketch seleccionado. Recuerda guardar.');
                      }}
                    >
                      <img
                        src={b.sketch_url}
                        alt=""
                        style={{
                          width: '100%',
                          height: 95,
                          objectFit: 'contain',
                          background: '#fff',
                          borderRadius: 6
                        }}
                      />
                      <span className="muted" style={{ fontSize: '0.75rem' }}>
                        Esc. {b.orden} · {b.tipo}
                      </span>
                      <span style={{ fontSize: '0.78rem' }}>
                        {(b.dialogo || '').slice(0, 55)}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <div className="page-content">
      <div className="row-between">
        <div>
          <strong style={{ fontSize: '1.05rem' }}>Guiones y Storyboards</strong>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            {guiones.length} guion{guiones.length === 1 ? '' : 'es'} en producción
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (availableIdeasForNew.length === 0) {
              onNotify('Primero agrega una idea disponible en la pestaña Ideas');
              return;
            }
            setSelectedIdeaId(String(availableIdeasForNew[0].id));
            setShowNewModal(true);
          }}
        >
          <Plus size={16} />
          Nuevo guion
        </button>
      </div>

      {loading ? (
        <p className="muted">Cargando guiones...</p>
      ) : guiones.length === 0 ? (
        <div className="empty-state">
          <p>Todavía no hay guiones creados.</p>
          <p className="muted">Crea uno desde una idea aprobada con el botón «Nuevo guion».</p>
        </div>
      ) : (
        groupedByMonth.map((group) => {
          const isOpen = !collapsedMonths.has(group.key);
          return (
            <section key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="month-header-btn"
                onClick={() => toggleMonth(group.key)}
              >
                <span>{isOpen ? '▾' : '▸'}</span>
                <strong style={{ flex: 1, textAlign: 'left' }}>{group.label}</strong>
                <span className="badge">{group.items.length}</span>
              </button>

              {isOpen &&
                group.items.map((g) => {
                  const stepIdx = ESTADOS_ORDER.indexOf(g.estado);
                  const recPct = g.escenas ? Math.round((g.escenas_grabadas / g.escenas) * 100) : 0;
                  const expPct = g.escenas
                    ? Math.round((g.escenas_exportadas / g.escenas) * 100)
                    : 0;
                  const overTime = g.duracion_estimada_s > g.duracion_max_s;

                  return (
                    <div key={g.id} className="card" style={{ gap: 10 }}>
                      <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <span className="badge">#{g.numero ?? g.id}</span>
                            {g.idea_numero != null && (
                              <span className="muted" style={{ fontSize: '0.78rem' }}>
                                Idea #{g.idea_numero}
                              </span>
                            )}
                            {g.pilar && <span className="badge">{g.pilar}</span>}
                            {g.objetivo && <span className="badge">{g.objetivo}</span>}
                          </div>
                          <strong style={{ display: 'block', marginTop: 4, fontSize: '1.02rem' }}>
                            {g.titulo}
                          </strong>
                        </div>

                        <select
                          className="select"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
                          value={g.estado}
                          onChange={(e) =>
                            void handleQuickEstado(g, e.target.value as GuionEstado)
                          }
                        >
                          {ESTADOS_ORDER.map((k) => (
                            <option key={k} value={k}>
                              {ESTADOS_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 5-step stepper */}
                      <div className="g-stepper" aria-label={`Paso ${stepIdx + 1} de 5`}>
                        {ESTADOS_ORDER.map((k, i) => (
                          <span
                            key={k}
                            title={ESTADOS_LABEL[k]}
                            className={
                              i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'pending'
                            }
                          />
                        ))}
                      </div>

                      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={`badge ${overTime ? 'notas' : ''}`}>
                          ≈{g.duracion_estimada_s}s de {g.duracion_max_s}s · {g.palabras} pal.
                        </span>
                        <div className="row" style={{ gap: 10, fontSize: '0.78rem' }}>
                          <span className="muted">
                            Grabado {g.escenas_grabadas}/{g.escenas} ({recPct}%)
                          </span>
                          <span className="muted">
                            Exportado {g.escenas_exportadas}/{g.escenas} ({expPct}%)
                          </span>
                        </div>
                      </div>

                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => void openEditor(g)}
                        >
                          Editar guion
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => onOpenStoryboard(g)}
                        >
                          <Clapperboard size={15} />
                          Storyboard / PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })
      )}

      {/* New Guion Modal */}
      {showNewModal && (
        <div className="storyboard-overlay">
          <form
            className="storyboard-container"
            style={{ maxWidth: 460 }}
            onSubmit={(e) => void handleCreateGuion(e)}
          >
            <div className="row-between">
              <strong>Nuevo guion desde idea</strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowNewModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="field">
              <label>Elige una idea</label>
              <select
                className="select"
                value={selectedIdeaId}
                onChange={(e) => setSelectedIdeaId(e.target.value)}
                required
              >
                {availableIdeasForNew.map((i) => (
                  <option key={i.id} value={i.id}>
                    #{i.numero ?? i.id} · {i.titulo}
                    {i.estado === 'aprobada' ? ' ✓ aprobada' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Crear guion
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
