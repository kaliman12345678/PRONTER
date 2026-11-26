import { useState } from 'react';
import { UserCheck, UserPlus, X } from 'lucide-react';
import type { Votante } from '../types/reellab';

interface Props {
  users: Votante[];
  activeUser: Votante | null;
  schemaMissing: boolean;
  canClose: boolean;
  onSelectUser: (user: Votante) => void;
  onCreateUser: (name: string) => Promise<void>;
  onClose: () => void;
}

export function UserSelectorModal({
  users,
  activeUser,
  schemaMissing,
  canClose,
  onSelectUser,
  onCreateUser,
  onClose
}: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreateUser(newName.trim());
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(6, 10, 19, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="row-between">
          <div className="row">
            <UserCheck size={22} color="#38bdf8" />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>¿Quién está usando la app?</h2>
          </div>
          {canClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          )}
        </div>

        <p className="muted" style={{ margin: 0 }}>
          Elige tu nombre para votar ideas, crear proyectos y marcarte como responsable. No pide
          contraseña.
        </p>

        {schemaMissing && (
          <div className="alert warning">
            Aún no se ha ejecutado <code>instalar.sql</code> de ReelLab en tu Supabase. Puedes
            entrar en modo local mientras tanto.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users
            .filter((u) => u.activo)
            .map((user) => {
              const isCurrent = activeUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`card-interactive ${isCurrent ? 'selected' : ''}`}
                  style={
                    isCurrent
                      ? { borderColor: 'var(--primary)', background: 'rgba(56,189,248,0.12)' }
                      : undefined
                  }
                  onClick={() => onSelectUser(user)}
                >
                  <strong>{user.nombre}</strong>
                  {isCurrent && <span className="badge">Activo</span>}
                </button>
              );
            })}
        </div>

        {!schemaMissing && (
          <form onSubmit={handleCreate} className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label htmlFor="new-user-name">¿No estás en la lista? Crea tu usuario</label>
            <div className="row">
              <input
                id="new-user-name"
                className="input"
                placeholder="Tu nombre..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={creating || !newName.trim()}
              >
                <UserPlus size={16} />
                Crear
              </button>
            </div>
          </form>
        )}

        {canClose && (
          <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
