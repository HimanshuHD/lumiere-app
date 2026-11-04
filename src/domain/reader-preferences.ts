export type FontSize = 'small' | 'medium' | 'large';
export type ReadingTheme = 'light' | 'sepia' | 'dark';
export type LineSpacing = 'comfortable' | 'compact';

export interface ReaderSettings {
  fontSize: FontSize;
  theme: ReadingTheme;
  lineSpacing: LineSpacing;
}

export const defaultSettings: ReaderSettings = {fontSize:'medium',theme:'light',lineSpacing:'comfortable'};
export function parseReaderSettings(input:unknown):ReaderSettings {
  const p=input && typeof input==='object'?input as Record<string,unknown>:{};
  return {fontSize:p.fontSize==='small'||p.fontSize==='large'?p.fontSize:'medium',theme:p.theme==='dark'||p.theme==='sepia'?p.theme:'light',lineSpacing:p.lineSpacing==='compact'?'compact':'comfortable'};
}
