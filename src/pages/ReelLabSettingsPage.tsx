import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus
} from 'lucide-react';
import {
  addCatalogoItem,
  deleteCatalogoItem,
  deleteVotante,
  fetchCatalogos,
  fetchPesosViralidad,
  getBrandContext,
  setBrandContext,
  toggleVotanteActivo,
  updatePesoViralidad
} from '../db/reellabService';
import {
  CLAUDE_MODELS,
  DEFAULT_EXPERT_PERSONA,
  GEMINI_MODELS,
  getAIConfig,
  saveAIConfig,
  testAIConnection,
  type AIConfig,
  type AIProvider
} from '../services/aiGenerator';
import type {
  CatalogoItem,
  CatalogoTipo,
  PesoViralidad,
  Votante
} from '../types/reellab';

interface Props {
  users: Votante[];
  activeUser: Votante | null;
  schemaMissing: boolean;
  onSelectUser: (u: Votante) => void;
  onCreateUser: (name: string) => Promise<void>;
  onRefreshUsers: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const CATALOGO_TIPOS: { value: CatalogoTipo; label: string }[] = [
  { value: 'pilar', label: 'Pilares' },
  { value: 'tematica', label: 'Temáticas' },
  { value: 'formato', label: 'Formatos' },
  { value: 'objetivo', label: 'Objetivos' },
  { value: 'presentador', label: 'Presentadores' },
  { value: 'herramienta', label: 'Herramientas' }
];

export function ReelLabSettingsPage({
  users,
  activeUser,
  schemaMissing,
  onSelectUser,
  onCreateUser,
  onRefreshUsers,
  onNotify
}: Props) {
  const [newUserName, setNewUserName] = useState('');
  const [catalogos, setCatalogos] = useState<CatalogoItem[]>([]);
  const [selectedTipo, setSelectedTipo] = useState<CatalogoTipo>('pilar');
  const [newCatVal, setNewCatVal] = useState('');
  const [pesos, setPesos] = useState<PesoViralidad[]>([]);
  const [brandCtx, setBrandCtx] = useState(() => getBrandContext());
  const [aiCfg, setAiCfg] = useState<AIConfig>(() => getAIConfig());
  const [showKey, setShowKey] = useState(false);
  const [testingAI, setTestingAI] = useState(false);

  const loadSettings = async () => {
    const [cats, pList] = await Promise.all([
      fetchCatalogos(),
      fetchPesosViralidad()
    ]);
    setCatalogos(cats);
    setPesos(pList);
  };

  useEffect(() => {
    if (!schemaMissing) {
      void loadSettings();
    }
  }, [schemaMissing]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    await onCreateUser(newUserName.trim());
    setNewUserName('');
    onNotify('Usuario creado');
  };

  const handleAddCatalogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatVal.trim()) return;
    await addCatalogoItem(selectedTipo, newCatVal);
    setNewCatVal('');
    await loadSettings();
    onNotify('Elemento agregado al catálogo');
  };

  const handleDeleteUser = async (u: Votante) => {
    if (!window.confirm(`¿Eliminar permanentemente a "${u.nombre}"? Se borrarán también sus votos.`)) {
      return;
    }
    try {
      await deleteVotante(u.id);
      await onRefreshUsers();
      onNotify('Usuario eliminado');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'No se pudo eliminar el usuario');
    }
  };

  if (schemaMissing) {
    return (
      <div className="page-content">
        <div className="alert warning">
          Ejecuta <code>ReelLab-kit/supabase/instalar.sql</code> en Supabase para administrar
          usuarios, catálogos y pesos de viralidad.
        </div>
      </div>
    );
  }

  const handleSaveAI = () => {
    setBrandContext(brandCtx);
    saveAIConfig(aiCfg);
    onNotify('Configuración IA y contexto guardados');
  };

  const handleTestAI = async () => {
    setTestingAI(true);
    try {
      saveAIConfig(aiCfg);
      const msg = await testAIConnection(aiCfg);
      onNotify(msg);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al probar conexión IA');
    } finally {
      setTestingAI(false);
    }
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="row">
            <Sparkles size={20} color="#a78bfa" />
            <strong>Motor IA y Experto en Tendencias</strong>
          </div>
          <span className="badge estructura">
            {aiCfg.provider === 'gemini'
              ? 'Gemini'
              : aiCfg.provider === 'claude-direct'
              ? 'Claude Directo'
              : 'Claude Servidor'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="ai-provider-sel">API a utilizar</label>
          <select
            id="ai-provider-sel"
            className="select"
            value={aiCfg.provider}
            onChange={(e) =>
              setAiCfg((prev) => ({ ...prev, provider: e.target.value as AIProvider }))
            }
          >
            <option value="gemini">Google Gemini (API Key propia · Free Tier o Créditos Pro)</option>
            <option value="claude-edge">Claude — Servidor actual del equipo (Supabase)</option>
            <option value="claude-direct">Claude — API Key propia (Anthropic directo)</option>
          </select>
        </div>

        {aiCfg.provider === 'gemini' && (
          <div
            style={{
              background: 'var(--bg-input)',
              padding: 12,
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            <div className="field">
              <div className="row-between">
                <label htmlFor="gemini-key-in">API Key de Google AI Studio</label>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#38bdf8', fontSize: '0.78rem' }}
                >
                  Crear clave en AI Studio →
                </a>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input
                  id="gemini-key-in"
                  type={showKey ? 'text' : 'password'}
                  className="input"
                  placeholder="AQ... o AIza..."
                  value={aiCfg.geminiApiKey}
                  onChange={(e) =>
                    setAiCfg((prev) => ({ ...prev, geminiApiKey: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Mostrar u ocultar clave"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="gemini-model-sel">Modelo de Gemini</label>
              <select
                id="gemini-model-sel"
                className="select"
                value={aiCfg.geminiModel}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, geminiModel: e.target.value }))
                }
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="row" style={{ gap: 8, fontSize: '0.86rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiCfg.useTrendsSearch}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, useTrendsSearch: e.target.checked }))
                }
              />
              <span>
                Consultar tendencias, temas actuales y memes en Google antes de generar{' '}
                <small className="muted">(usa búsqueda en vivo si el plan la habilita)</small>
              </span>
            </label>
          </div>
        )}

        {aiCfg.provider === 'claude-edge' && (
          <div className="alert" style={{ fontSize: '0.84rem' }}>
            Usa la conexión actual desplegada en Supabase (<code>generar-guion</code>) con la
            clave de Anthropic guardada en el servidor. Todo el equipo puede usarla sin pegar clave.
          </div>
        )}

        {aiCfg.provider === 'claude-direct' && (
          <div
            style={{
              background: 'var(--bg-input)',
              padding: 12,
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            <div className="field">
              <label htmlFor="claude-key-in">API Key de Anthropic (en este dispositivo)</label>
              <div className="row" style={{ gap: 6 }}>
                <input
                  id="claude-key-in"
                  type={showKey ? 'text' : 'password'}
                  className="input"
                  placeholder="sk-ant-..."
                  value={aiCfg.claudeApiKey}
                  onChange={(e) =>
                    setAiCfg((prev) => ({ ...prev, claudeApiKey: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Mostrar u ocultar clave"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="claude-model-sel">Modelo de Claude</label>
              <select
                id="claude-model-sel"
                className="select"
                value={aiCfg.claudeModel}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, claudeModel: e.target.value }))
                }
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="ai-region-in">Mercado / País para tendencias y lenguaje</label>
          <input
            id="ai-region-in"
            className="input"
            value={aiCfg.marketRegion}
            onChange={(e) =>
              setAiCfg((prev) => ({ ...prev, marketRegion: e.target.value }))
            }
            placeholder="Ej. Colombia y Latinoamérica"
          />
        </div>

        <div className="field">
          <label htmlFor="brand-ctx-in">Contexto fijo de tu marca (para la IA)</label>
          <textarea
            id="brand-ctx-in"
            className="textarea"
            rows={3}
            placeholder="Ej. Somos NOXA / Logitrafiker, vendemos... Cliente ideal... Tono cercano, directo y sin rodeos."
            value={brandCtx}
            onChange={(e) => setBrandCtx(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="row-between">
            <label htmlFor="expert-persona-in">Personalidad e instrucciones del Experto IA</label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.76rem' }}
              onClick={() =>
                setAiCfg((prev) => ({ ...prev, expertPersona: DEFAULT_EXPERT_PERSONA }))
              }
            >
              <RotateCcw size={12} />
              Restaurar experto
            </button>
          </div>
          <textarea
            id="expert-persona-in"
            className="textarea"
            rows={4}
            value={aiCfg.expertPersona}
            onChange={(e) =>
              setAiCfg((prev) => ({ ...prev, expertPersona: e.target.value }))
            }
          />
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={testingAI}
            onClick={() => void handleTestAI()}
          >
            <CheckCircle2 size={15} color="#34d399" />
            {testingAI ? 'Probando...' : 'Probar conexión'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={handleSaveAI}
          >
            <Save size={15} />
            Guardar configuración IA
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <UserCheck size={20} color="#38bdf8" />
          <strong>Usuarios del equipo</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map((u) => (
            <div key={u.id} className="row-between" style={{ background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => onSelectUser(u)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  flex: 1,
                  fontWeight: 600
                }}
              >
                {u.nombre}{' '}
                {activeUser?.id === u.id && <span className="badge">Activo</span>}
                {!u.activo && <span className="badge otro">Inactivo</span>}
              </button>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    void toggleVotanteActivo(u.id, !u.activo).then(onRefreshUsers)
                  }
                >
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
                {!u.activo && activeUser?.id !== u.id && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Eliminar usuario ${u.nombre}`}
                    onClick={() => void handleDeleteUser(u)}
                  >
                    <Trash2 size={15} color="#f87171" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddUser} className="row">
          <input
            className="input"
            placeholder="Nuevo integrante..."
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            <UserPlus size={16} />
            Agregar
          </button>
        </form>
      </div>

      <div className="card">
        <strong>Catálogos (pilares, formatos, objetivos...)</strong>
        <select
          className="select"
          value={selectedTipo}
          onChange={(e) => setSelectedTipo(e.target.value as CatalogoTipo)}
        >
          {CATALOGO_TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {catalogos
            .filter((c) => c.tipo === selectedTipo)
            .map((c) => (
              <div
                key={c.id}
                className="row-between"
                style={{ background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 8 }}
              >
                <span>{c.valor}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void deleteCatalogoItem(c.id).then(loadSettings)}
                >
                  <Trash2 size={15} color="#f87171" />
                </button>
              </div>
            ))}
        </div>

        <form onSubmit={handleAddCatalogo} className="row">
          <input
            className="input"
            placeholder="Agregar valor..."
            value={newCatVal}
            onChange={(e) => setNewCatVal(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            <Plus size={16} />
            Agregar
          </button>
        </form>
      </div>

      <div className="card">
        <strong>Pesos de la Calculadora de Viralidad</strong>
        {pesos.map((p) => (
          <div key={p.clave} className="row-between" style={{ gap: 8 }}>
            <span style={{ fontSize: '0.88rem', flex: 1 }}>{p.etiqueta}</span>
            <input
              type="number"
              step="0.5"
              className="input"
              style={{ width: 82, padding: '6px 8px' }}
              value={p.peso}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPesos((prev) =>
                  prev.map((x) => (x.clave === p.clave ? { ...x, peso: val } : x))
                );
                void updatePesoViralidad(p.clave, val);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
