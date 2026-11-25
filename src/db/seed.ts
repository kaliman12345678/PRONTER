import { getAllProjects, getDB } from './database';
import type { ContentPiece, Project, ScriptDocument } from '../types/models';

const SEED_FLAG_KEY = 'guion-en-pantalla-seeded-v1';

export async function ensureSeedData(): Promise<void> {
  const existing = await getAllProjects();
  if (existing.length > 0) {
    return;
  }

  if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_FLAG_KEY) === 'true') {
    return;
  }

  const now = Date.now();
  const projectId = 'proj-noxa';
  const pieceId = 'piece-manifestando-exito';

  const noxaProject: Project = {
    id: projectId,
    name: 'NOXA',
    description: 'Contenido principal de marca personal y mentalidad.',
    createdAt: now,
    updatedAt: now
  };

  const manifestandoPiece: ContentPiece = {
    id: pieceId,
    projectId,
    title: 'Manifestando éxito',
    referenceUrl: '',
    createdAt: now,
    updatedAt: now
  };

  const guionFinal: ScriptDocument = {
    id: 'doc-noxa-guion-final',
    pieceId,
    title: 'Guion final',
    type: 'Guion',
    createdAt: now,
    updatedAt: now,
    blocks: [
      {
        id: 'blk-gancho',
        title: 'Gancho',
        text: 'Deja de esperar a sentirte listo para empezar. El éxito que estás manifestando requiere que actúes hoy como la persona que ya lo logró.',
        cues: 'Plano medio cerrado, mirar directo a cámara con energía alta y pausa de 1 segundo al final.'
      },
      {
        id: 'blk-escena-1',
        title: 'Escena 1',
        text: 'Durante años pensé que manifestar era solo escribir metas en un cuaderno y esperar a que el universo hiciera su parte. Pero la claridad sin ejecución se convierte en frustración.',
        cues: 'Caminar despacio hacia la cámara o cambiar a plano detalle tomando notas.'
      },
      {
        id: 'blk-escena-2',
        title: 'Escena 2',
        text: 'Cuando cambias tus hábitos diarios —cómo organizas tu mañana, qué dices que no y en qué inviertes tu atención— tu mente empieza a respaldar lo que estás pidiendo.',
        cues: 'Tono firme y cercano. Enfatizar "hábitos diarios" y "atención".'
      },
      {
        id: 'blk-cierre',
        title: 'Cierre',
        text: 'Guarda este video para recordarlo mañana por la mañana y cuéntame en comentarios cuál es el primer paso que vas a dar hoy.',
        cues: 'Sonrisa breve, señalar abajo hacia el botón de guardar y mantener mirada 2 segundos.'
      }
    ]
  };

  const estructuraReel: ScriptDocument = {
    id: 'doc-noxa-estructura',
    pieceId,
    title: 'Estructura del reel',
    type: 'Estructura',
    createdAt: now - 1000,
    updatedAt: now - 1000,
    blocks: [
      {
        id: 'blk-est-1',
        title: '0-3s | Gancho visual y verbal',
        text: 'Frase disruptiva rompiendo el mito de manifestar sin acción.',
        cues: 'Subtítulos grandes en pantalla. Corte rápido al segundo 2.'
      },
      {
        id: 'blk-est-2',
        title: '3-15s | Problema común',
        text: 'Explicar por qué anotar metas sin cambiar hábitos genera estancamiento.',
        cues: 'Música ambiental suave al 15% de volumen.'
      },
      {
        id: 'blk-est-3',
        title: '15-30s | Cambio de enfoque',
        text: 'Conectar la mentalidad con microacciones diarias medibles.',
        cues: 'Mostrar B-roll de escritorio o agenda.'
      },
      {
        id: 'blk-est-4',
        title: '30-38s | Llamado a la acción',
        text: 'Invitar a guardar el reel y comentar el primer hábito de la semana.',
        cues: 'Texto fijo en pantalla: "Guárdalo para mañana".'
      }
    ]
  };

  const libretoAlternativo: ScriptDocument = {
    id: 'doc-noxa-libreto',
    pieceId,
    title: 'Libreto alternativo',
    type: 'Libreto',
    createdAt: now - 2000,
    updatedAt: now - 2000,
    blocks: [
      {
        id: 'blk-lib-1',
        title: 'Apertura íntima',
        text: 'Si sientes que trabajas muchísimo pero sigues en el mismo lugar, escucha esto con calma.',
        cues: 'Voz baja y pausada, luz cálida lateral.'
      },
      {
        id: 'blk-lib-2',
        title: 'Desarrollo',
        text: 'Manifestar éxito no es magia; es coherencia entre lo que deseas, lo que piensas y lo que repites cada día cuando nadie te ve.',
        cues: 'Acercamiento lento (zoom digital sutil en edición).'
      },
      {
        id: 'blk-lib-3',
        title: 'Cierre reflexivo',
        text: 'Empieza con una sola promesa cumplida hoy. Eso cambia toda tu semana.',
        cues: 'Pausa final antes de cortar.'
      }
    ]
  };

  const db = await getDB();
  const tx = db.transaction(['projects', 'pieces', 'documents'], 'readwrite');
  await tx.objectStore('projects').put(noxaProject);
  await tx.objectStore('pieces').put(manifestandoPiece);
  await tx.objectStore('documents').put(guionFinal);
  await tx.objectStore('documents').put(estructuraReel);
  await tx.objectStore('documents').put(libretoAlternativo);
  await tx.done;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SEED_FLAG_KEY, 'true');
  }
}
