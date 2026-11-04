import type { PreferencesPort } from '@/domain/integrations';
import { parseReaderSettings } from '@/domain/reader-preferences';
import type { ReaderSettings } from '@/domain/reader-preferences';
import { toServiceError } from '@/domain/errors';
import type { ServiceResult } from '@/domain/errors';
export type { ReaderSettings, FontSize, ReadingTheme, LineSpacing } from '@/domain/reader-preferences';
export { fontSizeMap, lineHeightMap, themeMap } from './theme';
export function loadSettings(preferencesStorage: PreferencesPort):ReaderSettings {try{return parseReaderSettings(preferencesStorage.read());}catch{return parseReaderSettings(null);}}
export function saveSettings(settings:ReaderSettings, preferencesStorage: PreferencesPort):ServiceResult<void> {try{preferencesStorage.write(parseReaderSettings(settings));return {ok:true,value:undefined};}catch(error){return {ok:false,error:toServiceError(error)};}}
