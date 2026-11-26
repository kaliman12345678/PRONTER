import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onGoIdeas: () => void;
  onGoHooks: () => void;
  onGoScripts: () => void;
}

const STEPS = [
  { id: 'base', num: '0', title: 'Bases' },
  { id: 'objetivo', num: '1', title: 'Objetivo' },
  { id: 'idea', num: '2', title: 'Idea' },
  { id: 'calc', num: '3', title: 'Calculadora' },
  { id: 'guion', num: '4', title: 'Guion y CTA' },
  { id: 'ganchos', num: '5', title: 'Ganchos' },
  { id: 'grabar', num: '6', title: 'Grabación y Edición' }
] as const;

export function ProcesoGuideModal({ onClose, onGoIdeas, onGoHooks, onGoScripts }: Props) {
  const [activeTab, setActiveTab] = useState<(typeof STEPS)[number]['id']>('base');

  return (
    <div className="storyboard-overlay">
      <div className="storyboard-container" style={{ maxWidth: 760 }}>
        <div className="row-between">
          <div className="row" style={{ gap: 8 }}>
            <BookOpen size={20} color="#38bdf8" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                Proceso de creación de videos virales
              </h2>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                De la idea a la publicación · Guía rápida
              </span>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tab-btn ${activeTab === s.id ? 'active' : ''}`}
              style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}
              onClick={() => setActiveTab(s.id)}
            >
              {s.num}. {s.title}
            </button>
          ))}
        </div>

        <div className="card" style={{ gap: 10 }}>
          {activeTab === 'base' && (
            <>
              <strong>0 · Por qué un video se hace viral</strong>
              <p className="muted" style={{ margin: 0 }}>
                El algoritmo premia el video que retiene a más personas. Tu único control es hacer
                contenido que guste a más gente que el de tu competencia.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                <li>
                  <strong>Filtro 5-50:</strong> ¿Lo entiende un niño de 5 años? ¿Le interesa a 50 de
                  cada 100 personas? Si no pasa, abre el nicho.
                </li>
                <li>
                  <strong>Niveles de conciencia (0–4):</strong> El 90 % de la audiencia está en los
                  niveles 0 y 1 (no sabe o apenas empieza a notar el problema). Ahí apunta el video
                  viral.
                </li>
                <li>
                  <strong>Las 6 partes de un video:</strong> Objetivo, idea, guion, formato,
                  grabación y edición. Si una falla, el video no despega.
                </li>
              </ul>
            </>
          )}

          {activeTab === 'objetivo' && (
            <>
              <strong>1 · Definir el objetivo del video</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                <li>
                  <strong>Viralidad / Branding (25 %):</strong> Solo captar atención. Más corto, sin
                  enseñanza ni CTA.
                </li>
                <li>
                  <strong>Seguidores (25 %):</strong> Gancho, retención y una razón de peso para
                  seguir («Sígueme para más» no funciona).
                </li>
                <li>
                  <strong>Venta (50 %):</strong> Estructura viral + moraleja que te posicione como
                  experto + CTA al embudo o palabra clave.
                </li>
              </ul>
            </>
          )}

          {activeTab === 'idea' && (
            <>
              <strong>2 · Encontrar y estructurar la idea ganadora</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                <li>
                  <strong>20 % Referencias del mismo nicho:</strong> Videos que ya funcionaron,
                  replanteados con otro enfoque.
                </li>
                <li>
                  <strong>30 % Referencias de otro nicho:</strong> Traer la estructura o formato a tu
                  sector.
                </li>
                <li>
                  <strong>50 % Ideas propias:</strong> Documenta preguntas reales de clientes y
                  resultados.
                </li>
              </ul>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onGoIdeas();
                }}
              >
                Ir a Banco de Ideas
              </button>
            </>
          )}

          {activeTab === 'calc' && (
            <>
              <strong>3 · Validar con la Calculadora de Viralidad</strong>
              <p className="muted" style={{ margin: 0 }}>
                Antes de grabar, evalúa cada idea con los 6 criterios: Filtro 5 años, Filtro 50/100,
                Referencia viral, Mercado viral (salud, dinero, desarrollo, relaciones), Tendencia
                y Controversia, más el puntaje del Formato.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onGoIdeas();
                }}
              >
                Calificar ideas ahora
              </button>
            </>
          )}

          {activeTab === 'guion' && (
            <>
              <strong>4 · Escribir el guion: Gancho → Historia → Moraleja → CTA</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                <li>
                  <strong>1. Gancho (0–3 s):</strong> Se decide en 0,6 s si la persona se queda.
                </li>
                <li>
                  <strong>2. Historia / Contexto:</strong> Mantiene la curiosidad sin revelar todo
                  de golpe (usa regancho o regla de 3).
                </li>
                <li>
                  <strong>3. Moraleja:</strong> La enseñanza que te posiciona como autoridad.
                </li>
                <li>
                  <strong>4. CTA:</strong> Pide una sola acción clara con una razón concreta
                  (palabra clave en comentarios, guardar o seguir).
                </li>
              </ul>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onGoScripts();
                }}
              >
                Ir a Guiones y Storyboards
              </button>
            </>
          )}

          {activeTab === 'ganchos' && (
            <>
              <strong>5 · Elegir el gancho: 49 tipos en 7 familias</strong>
              <p className="muted" style={{ margin: 0 }}>
                Combina lo que se oye con un estímulo visual en los primeros 2 segundos. Evita
                promesas falsas y evalúa cada gancho con el Calificador automático (≤ 12 palabras,
                elemento visual y dato concreto).
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onGoHooks();
                }}
              >
                Abrir 49 Ganchos y Calificador
              </button>
            </>
          )}

          {activeTab === 'grabar' && (
            <>
              <strong>6 · Grabación, Edición y Teleprompter</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                <li>
                  <strong>Grabación:</strong> Usa el Storyboard impreso o en pantalla para marcar
                  cada escena como Grabada y Exportada.
                </li>
                <li>
                  <strong>Teleprompter:</strong> Lanza cualquier guion directo al Teleprompter con
                  indicaciones de plano, cámara y texto en pantalla.
                </li>
                <li>
                  <strong>Ritmo:</strong> ~3 palabras por segundo (50–60 segundos ≈ 150–180 palabras).
                </li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
