export type CatalogoTipo =
  | 'pilar'
  | 'tematica'
  | 'formato'
  | 'objetivo'
  | 'presentador'
  | 'herramienta';

export interface CatalogoItem {
  id: number;
  tipo: CatalogoTipo;
  valor: string;
  orden: number;
  activo: boolean;
}

export interface PesoViralidad {
  clave: string;
  etiqueta: string;
  peso: number;
}

export interface Lote {
  id: number;
  numero: number;
  nombre: string;
  fecha: string;
  notas?: string | null;
}

export interface Votante {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

export type IdeaEstado =
  | 'nueva'
  | 'calificada'
  | 'aprobada'
  | 'en_espera'
  | 'descartada'
  | 'en_guion';

export interface IdeaConPuntaje {
  id: number;
  numero?: number | null;
  titulo: string;
  texto_base?: string | null;
  pilar?: string | null;
  tematica?: string | null;
  formato?: string | null;
  presentador?: string | null;
  referencia_url?: string | null;
  contexto?: string | null;
  palabras_clave?: string | null;
  origen: 'manual' | 'ia' | 'referencia';
  nino_5: boolean;
  gusta_50: boolean;
  ref_viral: boolean;
  mercado_viral: boolean;
  tendencia: boolean;
  controversia: boolean;
  calificada: boolean;
  estado: IdeaEstado;
  lote_id?: number | null;
  lote_numero?: number | null;
  lote_nombre?: string | null;
  nivel_conciencia?: number | null;
  texto_pantalla?: string | null;
  duracion_aprox_s?: number | null;
  herramienta?: string | null;
  puntaje_idea: number;
  puntaje_formato: number;
  puntaje_total: number;
  voto_promedio?: number | null;
  votos: number;
  guion_id?: number | null;
  rescatada_de?: number | null;
  creado_en: string;
}

export interface VotoIdea {
  idea_id: number;
  votante_id: number;
  puntaje: number;
}

export interface VotoPieza {
  pieza_id: number;
  votante_id: number;
  puntaje: number;
}

export interface SketchBankItem {
  sketch_url: string;
  dialogo: string;
  plano?: string | null;
  tipo: BloqueTipo;
  guion_id: number;
  orden: number;
}

export type GuionEstado =
  | 'pendiente'
  | 'guion_listo'
  | 'grabado'
  | 'editado'
  | 'publicado';

export interface GuionResumen {
  id: number;
  idea_id: number;
  numero?: number | null;
  parte: number;
  titulo: string;
  objetivo?: string | null;
  duracion_max_s: number;
  formato_grabacion: string;
  locacion?: string | null;
  iluminacion?: string | null;
  tono?: string | null;
  ganchos_alternativos: string[];
  notas: string[];
  estado: GuionEstado;
  url_publicado?: string | null;
  gancho_id?: number | null;
  cta_id?: number | null;
  pilar?: string | null;
  tematica?: string | null;
  formato?: string | null;
  idea_numero?: number | null;
  palabras: number;
  duracion_estimada_s: number;
  escenas: number;
  escenas_grabadas: number;
  escenas_exportadas: number;
  creado_en: string;
}

export type BloqueTipo = 'gancho' | 'historia' | 'moraleja' | 'cta' | 'moraleja_cta';

export interface BloqueStoryboard {
  id: number;
  guion_id: number;
  orden: number;
  tipo: BloqueTipo;
  inicio_s?: number | null;
  fin_s?: number | null;
  dialogo: string;
  texto_pantalla: string;
  plano?: string | null;
  camara?: string | null;
  edicion: string[];
  sketch_url?: string | null;
  sketch_prompt?: string | null;
  sketch_texto?: string | null;
  grabado: boolean;
  exportado: boolean;
}

export interface GanchoTipo {
  id: number;
  numero: number;
  nombre: string;
  familia: string;
  mecanismo: string;
  plantilla: string;
  ejemplo: string;
  advertencia?: string | null;
}

export interface PiezaResumen {
  id: number;
  clase: 'gancho' | 'cta';
  texto: string;
  visual?: string | null;
  gancho_tipo_id?: number | null;
  objetivo?: string | null;
  palabra_clave_id?: number | null;
  guion_id?: number | null;
  estado: 'en_uso' | 'potencial' | 'usado' | 'descartado';
  checklist: Record<string, boolean>;
  resultado?: number | null;
  nota?: string | null;
  tipo_numero?: number | null;
  tipo_nombre?: string | null;
  tipo_familia?: string | null;
  palabra?: string | null;
  guion_numero?: number | null;
  guion_titulo?: string | null;
  voto_promedio?: number | null;
  votos: number;
}

export interface PalabraClave {
  id: number;
  palabra: string;
  variantes?: string | null;
  recurso?: string | null;
  herramienta?: string | null;
  codigo?: string | null;
  activa: boolean;
  notas?: string | null;
}
