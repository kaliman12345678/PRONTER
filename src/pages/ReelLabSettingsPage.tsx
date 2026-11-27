import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe,
  Lock,
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
  toggleVotanteActivo,
  updatePesoViralidad
} from '../db/reellabService';
import {
  AI_CONFIG_CHANGED_EVENT,
  CLAUDE_MODELS,
  DEFAULT_EXPERT_PERSONA,
  GEMINI_MODELS,
  TRENDS_GEOS,
  TRENDS_SOURCES,
  getAIConfig,
  getTeamVaultStatus,
  saveAndSyncAIConfig,
  saveEncryptedTeamKey,
  testAIConnection,
  testTrendsConnection,
  type AIConfig,
  type AIProvider,
  type TeamVaultStatus,
  type TrendsSource
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
  const [vaultStatus, setVaultStatus] = useState<TeamVaultStatus>({
    deployed: false,
    gemini: { configured: false, hint: '' },
    tavily: { configured: false, hint: '' },
    claude: { configured: false, hint: '' }
  });
  const [testingAI, setTestingAI] = useState(false);
  const [testingTrends, setTestingTrends] = useState(false);
  const [savingAI, setSavingAI] = useState(false);

  const loadSettings = async () => {
    const [cats, pList, vStatus] = await Promise.all([
      fetchCatalogos(),
      fetchPesosViralidad(),
      getTeamVaultStatus()
    ]);
    setCatalogos(cats);
    setPesos(pList);
    setVaultStatus(vStatus);
  };

  useEffect(() => {
    if (!schemaMissing) {
      void loadSettings();
    }
  }, [schemaMissing]);

  useEffect(() => {
    const onRemoteChange = () => {
      setAiCfg(getAIConfig());
      setBrandCtx(getBrandContext());
    };
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, onRemoteChange);
    return () => window.removeEventListener(AI_CONFIG_CHANGED_EVENT, onRemoteChange);
  }, []);

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

  const handleSaveAI = async () => {
    setSavingAI(true);
    try {
      let updatedCfg = { ...aiCfg };

      // Always encrypt pasted keys in Supabase server vault so nobody can view them again
      if (updatedCfg.geminiApiKey.trim()) {
        await saveEncryptedTeamKey('gemini', updatedCfg.geminiApiKey.trim());
        updatedCfg.geminiApiKey = '';
      }
      if (updatedCfg.tavilyApiKey.trim()) {
        await saveEncryptedTeamKey('tavily', updatedCfg.tavilyApiKey.trim());
        updatedCfg.tavilyApiKey = '';
      }
      if (updatedCfg.claudeApiKey.trim()) {
        await saveEncryptedTeamKey('claude', updatedCfg.claudeApiKey.trim());
        updatedCfg.claudeApiKey = '';
      }

      const { synced } = await saveAndSyncAIConfig(
        updatedCfg,
        brandCtx,
        activeUser?.nombre || 'Equipo'
      );
      setAiCfg(getAIConfig());
      const nextVault = await getTeamVaultStatus();
      setVaultStatus(nextVault);
      onNotify(
        synced
          ? 'Configuración IA guardada y sincronizada para todo el equipo'
          : 'Guardado localmente (sin conexión a nube)'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al guardar configuración IA');
    } finally {
      setSavingAI(false);
    }
  };

  const handleTestAI = async () => {
    setTestingAI(true);
    try {
      const msg = await testAIConnection(aiCfg);
      onNotify(msg);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al probar conexión IA');
    } finally {
      setTestingAI(false);
    }
  };

  const handleTestTrends = async () => {
    setTestingTrends(true);
    try {
      const msg = await testTrendsConnection(aiCfg);
      onNotify(msg);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Error al probar tendencias');
    } finally {
      setTestingTrends(false);
    }
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="row">
            <Sparkles size={20} color="#a78bfa" />
            <strong>Motor IA del Equipo (Sincronizado)</strong>
          </div>
          <span className="badge estructura">
            {aiCfg.provider === 'claude-direct' ? 'Claude' : 'Gemini'}
          </span>
        </div>

        <div className="alert" style={{ fontSize: '0.82rem', padding: '8px 10px' }}>
          Al guardar aquí, la <strong>API activa, modelo, fuente de tendencias y reglas</strong>{' '}
          se aplican automáticamente a todos los dispositivos del equipo.
          {aiCfg.updatedBy && aiCfg.updatedAt ? (
            <div className="muted" style={{ marginTop: 2 }}>
              Último cambio por <strong>{aiCfg.updatedBy}</strong> ·{' '}
              {new Date(aiCfg.updatedAt).toLocaleString('es-CO')}
            </div>
          ) : null}
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
            <option value="gemini">Google Gemini (Por defecto · Free Tier o Créditos Pro)</option>
            <option value="claude-direct">Claude (API Key propia / bóveda cifrada)</option>
          </select>
        </div>

        <div className="muted row" style={{ gap: 6, fontSize: '0.8rem' }}>
          <Lock size={13} color="#34d399" />
          <span>
            Las claves API siempre se guardan cifradas en Supabase (nadie vuelve a verlas; aplica a
            todo el equipo).
          </span>
        </div>

        {!vaultStatus.deployed && (
          <div className="alert warning" style={{ fontSize: '0.8rem', padding: '8px 10px' }}>
            No se detectó la bóveda cifrada <code>ai-proxy</code> en Supabase. Verifica que esté
            desplegada para cifrar claves del equipo.
          </div>
        )}

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
              <label htmlFor="gemini-key-in">API Key de Google AI Studio</label>
              {vaultStatus.gemini.configured && (
                <div style={{ fontSize: '0.8rem', marginBottom: 4, color: '#34d399' }}>
                  🔒 Clave cifrada y oculta en Supabase ({vaultStatus.gemini.hint})
                </div>
              )}
              <input
                id="gemini-key-in"
                type="password"
                autoComplete="off"
                className="input"
                placeholder={
                  vaultStatus.gemini.configured
                    ? 'Pega otra clave solo si quieres reemplazarla...'
                    : 'AQ... o AIza...'
                }
                value={aiCfg.geminiApiKey}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, geminiApiKey: e.target.value }))
                }
              />
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
              <label htmlFor="claude-key-in">API Key de Anthropic</label>
              {vaultStatus.claude.configured && (
                <div style={{ fontSize: '0.8rem', marginBottom: 4, color: '#34d399' }}>
                  🔒 Clave cifrada y oculta en Supabase ({vaultStatus.claude.hint})
                </div>
              )}
              <input
                id="claude-key-in"
                type="password"
                autoComplete="off"
                className="input"
                placeholder={
                  vaultStatus.claude.configured
                    ? 'Pega otra clave solo si quieres reemplazarla...'
                    : 'sk-ant-...'
                }
                value={aiCfg.claudeApiKey}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, claudeApiKey: e.target.value }))
                }
              />
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

        {/* Trends Source Selector */}
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
          <div className="row">
            <Globe size={16} color="#38bdf8" />
            <strong style={{ fontSize: '0.9rem' }}>Fuente de tendencias y memes actuales</strong>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="trends-src-sel">Cómo consultar tendencias</label>
              <select
                id="trends-src-sel"
                className="select"
                value={aiCfg.trendsSource}
                onChange={(e) =>
                  setAiCfg((prev) => ({
                    ...prev,
                    trendsSource: e.target.value as TrendsSource,
                    useTrendsSearch: e.target.value !== 'off'
                  }))
                }
              >
                {TRENDS_SOURCES.map((ts) => (
                  <option key={ts.value} value={ts.value}>
                    {ts.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="trends-geo-sel">País para Google Trends</label>
              <select
                id="trends-geo-sel"
                className="select"
                value={aiCfg.trendsGeo}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, trendsGeo: e.target.value }))
                }
              >
                {TRENDS_GEOS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(aiCfg.trendsSource === 'tavily' || aiCfg.trendsSource === 'auto') && (
            <div className="field">
              <label htmlFor="tavily-key-in">
                API Key gratuita de Tavily (opcional · 1,000 búsquedas/mes sin tarjeta)
              </label>
              {vaultStatus.tavily.configured && (
                <div style={{ fontSize: '0.8rem', marginBottom: 4, color: '#34d399' }}>
                  🔒 Clave Tavily cifrada ({vaultStatus.tavily.hint})
                </div>
              )}
              <input
                id="tavily-key-in"
                type="password"
                autoComplete="off"
                className="input"
                placeholder={
                  vaultStatus.tavily.configured
                    ? 'Pega otra clave solo si quieres reemplazarla...'
                    : 'tvly-...'
                }
                value={aiCfg.tavilyApiKey}
                onChange={(e) =>
                  setAiCfg((prev) => ({ ...prev, tavilyApiKey: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="ai-region-in">Mercado / País para lenguaje</label>
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
            placeholder="Ej. Marca, producto/servicio, cliente ideal y tono..."
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
            {testingAI ? 'Probando IA...' : 'Probar IA'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={testingTrends}
            onClick={() => void handleTestTrends()}
          >
            <Globe size={15} color="#38bdf8" />
            {testingTrends ? 'Probando...' : 'Probar tendencias'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            disabled={savingAI}
            onClick={() => void handleSaveAI()}
          >
            <Save size={15} />
            {savingAI ? 'Guardando y sincronizando...' : 'Guardar para todo el equipo'}
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
