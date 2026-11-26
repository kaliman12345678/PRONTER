import { useEffect, useState } from 'react';
import { Plus, Trash2, UserCheck, UserPlus } from 'lucide-react';
import {
  addCatalogoItem,
  deleteCatalogoItem,
  fetchCatalogos,
  fetchPesosViralidad,
  toggleVotanteActivo,
  updatePesoViralidad
} from '../db/reellabService';
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

  return (
    <div className="page-content">
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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void toggleVotanteActivo(u.id, !u.activo).then(onRefreshUsers)
                }
              >
                {u.activo ? 'Desactivar' : 'Activar'}
              </button>
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
