import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Trash2, Upload, Video } from 'lucide-react';
import type { ContentPiece } from '../types/models';
import { parseReferenceVideoUrl } from '../utils/videoEmbed';

interface Props {
  piece: ContentPiece;
  onSaveReferenceUrl: (url: string) => Promise<void>;
  onUploadVideoFile: (file: File) => Promise<void>;
  onRemoveVideoFile: () => Promise<void>;
}

export function ReferenceVideoSection({
  piece,
  onSaveReferenceUrl,
  onUploadVideoFile,
  onRemoveVideoFile
}: Props) {
  const [urlInput, setUrlInput] = useState(piece.referenceUrl || '');
  const [showPlayer, setShowPlayer] = useState(false);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'url' | 'file'>(piece.videoBlob ? 'file' : 'url');

  useEffect(() => {
    setUrlInput(piece.referenceUrl || '');
  }, [piece.referenceUrl]);

  useEffect(() => {
    if (!piece.videoBlob) {
      setLocalVideoUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(piece.videoBlob);
    setLocalVideoUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [piece.videoBlob]);

  const parsedUrl = parseReferenceVideoUrl(piece.referenceUrl || '');

  const handleSaveUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveReferenceUrl(urlInput.trim());
    if (urlInput.trim()) setShowPlayer(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUploadVideoFile(file);
    setMode('file');
    setShowPlayer(true);
    e.target.value = '';
  };

  return (
    <section className="card">
      <div className="row-between">
        <div className="row">
          <Video size={18} color="#38bdf8" />
          <strong>Video de referencia (opcional)</strong>
        </div>
        {(parsedUrl || localVideoUrl) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPlayer((v) => !v)}
          >
            {showPlayer ? 'Ocultar video' : 'Ver video'}
          </button>
        )}
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab-btn ${mode === 'url' ? 'active' : ''}`}
          onClick={() => setMode('url')}
        >
          Enlace de referencia
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'file' ? 'active' : ''}`}
          onClick={() => setMode('file')}
        >
          Subir video (opcional)
        </button>
      </div>

      {mode === 'url' ? (
        <form onSubmit={handleSaveUrl} className="field">
          <label htmlFor="ref-url-input">URL de YouTube, Shorts, Vimeo, TikTok o Instagram</label>
          <div className="row">
            <input
              id="ref-url-input"
              type="url"
              className="input"
              placeholder="https://youtube.com/shorts/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm">
              <Link2 size={16} />
              Guardar
            </button>
          </div>

          {showPlayer && parsedUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {parsedUrl.kind === 'iframe' && parsedUrl.embedUrl && (
                <div className="video-frame-wrap">
                  <iframe
                    src={parsedUrl.embedUrl}
                    title={`Referencia ${parsedUrl.platformLabel}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              {parsedUrl.kind === 'direct-video' && parsedUrl.embedUrl && (
                <div className="video-frame-wrap">
                  <video src={parsedUrl.embedUrl} controls playsInline />
                </div>
              )}
              {parsedUrl.kind === 'unsupported' && (
                <div className="alert">
                  Este enlace no permite vista embebida directa, pero puedes abrirlo externamente.
                </div>
              )}
              <a
                href={parsedUrl.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={15} />
                Abrir enlace externo ({parsedUrl.platformLabel})
              </a>
            </div>
          )}
        </form>
      ) : (
        <div className="field">
          <label>Archivo de video guardado en este dispositivo (opcional)</label>
          {localVideoUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row-between">
                <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {piece.videoFileName || 'Video adjunto'}
                </span>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={onRemoveVideoFile}
                >
                  <Trash2 size={15} />
                  Quitar
                </button>
              </div>
              {showPlayer && (
                <div className="video-frame-wrap">
                  <video src={localVideoUrl} controls playsInline />
                </div>
              )}
            </div>
          ) : (
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              <Upload size={18} />
              Elegir archivo de video (opcional)
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      )}
    </section>
  );
}
