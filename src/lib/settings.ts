export type FontSize = 'small' | 'medium' | 'large';
export type ReadingTheme = 'light' | 'sepia' | 'dark';
export type LineSpacing = 'comfortable' | 'compact';

export interface ReaderSettings {
  fontSize: FontSize;
  theme: ReadingTheme;
  lineSpacing: LineSpacing;
}

const STORAGE_KEY = 'reader-settings';

const defaultSettings: ReaderSettings = {
  fontSize: 'medium',
  theme: 'light',
  lineSpacing: 'comfortable',
};

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: ReaderSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const fontSizeMap: Record<FontSize, string> = {
  small: 'text-base',
  medium: 'text-lg',
  large: 'text-xl',
};

export const lineHeightMap: Record<LineSpacing, string> = {
  comfortable: 'leading-loose',
  compact: 'leading-relaxed',
};

export interface ThemeColors {
  bg: string;
  text: string;
  subText: string;
  accent: string;
  border: string;
  cardBg: string;
  sidebarBg: string;
  headerBg: string;
}

export const themeMap: Record<ReadingTheme, ThemeColors> = {
  light: {
    bg: 'bg-white',
    text: 'text-stone-900',
    subText: 'text-stone-500',
    accent: 'text-amber-700',
    border: 'border-stone-200',
    cardBg: 'bg-white',
    sidebarBg: 'bg-stone-50',
    headerBg: 'bg-white/95',
  },
  sepia: {
    bg: 'bg-[#f4ecd8]',
    text: 'text-[#5b4636]',
    subText: 'text-[#8a7a65]',
    accent: 'text-amber-800',
    border: 'border-[#e0d5bf]',
    cardBg: 'bg-[#f4ecd8]',
    sidebarBg: 'bg-[#ede2c9]',
    headerBg: 'bg-[#f4ecd8]/95',
  },
  dark: {
    bg: 'bg-stone-900',
    text: 'text-stone-200',
    subText: 'text-stone-400',
    accent: 'text-amber-400',
    border: 'border-stone-700',
    cardBg: 'bg-stone-800',
    sidebarBg: 'bg-stone-850',
    headerBg: 'bg-stone-900/95',
  },
};
