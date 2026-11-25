export type DocumentType = 'Guion' | 'Libreto' | 'Estructura' | 'Notas' | 'Otro';

export const DOCUMENT_TYPES: DocumentType[] = [
  'Guion',
  'Libreto',
  'Estructura',
  'Notas',
  'Otro'
];

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContentPiece {
  id: string;
  projectId: string;
  title: string;
  referenceUrl?: string;
  videoBlob?: Blob;
  videoFileName?: string;
  videoMimeType?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptBlock {
  id: string;
  title: string;
  text: string;
  cues?: string;
}

export interface ScriptDocument {
  id: string;
  pieceId: string;
  title: string;
  type: DocumentType;
  blocks: ScriptBlock[];
  createdAt: number;
  updatedAt: number;
}

export interface TeleprompterSettings {
  fontSize: number;
  speed: number;
  showCues: boolean;
}
