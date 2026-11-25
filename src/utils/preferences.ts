import type { TeleprompterSettings } from '../types/models';

const SETTINGS_KEY = 'guion-en-pantalla-teleprompter-settings-v1';

export const DEFAULT_TELEPROMPTER_SETTINGS: TeleprompterSettings = {
  fontSize: 34,
  speed: 4,
  showCues: false
};

export function loadTeleprompterSettings(): TeleprompterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_TELEPROMPTER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TeleprompterSettings>;
    return {
      fontSize: typeof parsed.fontSize === 'number' ? Math.min(64, Math.max(20, parsed.fontSize)) : DEFAULT_TELEPROMPTER_SETTINGS.fontSize,
      speed: typeof parsed.speed === 'number' ? Math.min(10, Math.max(1, parsed.speed)) : DEFAULT_TELEPROMPTER_SETTINGS.speed,
      showCues: typeof parsed.showCues === 'boolean' ? parsed.showCues : DEFAULT_TELEPROMPTER_SETTINGS.showCues
    };
  } catch {
    return DEFAULT_TELEPROMPTER_SETTINGS;
  }
}

export function saveTeleprompterSettings(settings: TeleprompterSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
