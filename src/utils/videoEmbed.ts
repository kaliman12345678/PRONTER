export interface ParsedVideoReference {
  kind: 'iframe' | 'direct-video' | 'unsupported';
  embedUrl?: string;
  originalUrl: string;
  platformLabel: string;
}

export function parseReferenceVideoUrl(rawUrl: string): ParsedVideoReference | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const originalUrl = url.toString();

  // Direct video file URL (mp4, webm, mov)
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url.pathname)) {
    return {
      kind: 'direct-video',
      embedUrl: originalUrl,
      originalUrl,
      platformLabel: 'Video directo'
    };
  }

  // YouTube & YouTube Shorts
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = url.pathname.slice(1).split('/')[0];
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2] || '';
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2] || '';
    } else {
      videoId = url.searchParams.get('v') || '';
    }

    if (videoId) {
      return {
        kind: 'iframe',
        embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
        originalUrl,
        platformLabel: 'YouTube'
      };
    }
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/\/(\d+)/);
    if (match) {
      return {
        kind: 'iframe',
        embedUrl: `https://player.vimeo.com/video/${match[1]}`,
        originalUrl,
        platformLabel: 'Vimeo'
      };
    }
  }

  // TikTok
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/);
    if (match) {
      return {
        kind: 'iframe',
        embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}`,
        originalUrl,
        platformLabel: 'TikTok'
      };
    }
  }

  // Instagram Reel / Post
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const match = url.pathname.match(/\/(reel|p|tv)\/([^/?#]+)/);
    if (match) {
      return {
        kind: 'iframe',
        embedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/embed`,
        originalUrl,
        platformLabel: 'Instagram'
      };
    }
  }

  // Google Drive preview
  if (host === 'drive.google.com') {
    const match = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (match) {
      return {
        kind: 'iframe',
        embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`,
        originalUrl,
        platformLabel: 'Google Drive'
      };
    }
  }

  return {
    kind: 'unsupported',
    originalUrl,
    platformLabel: 'Enlace externo'
  };
}
