import type { ReaderSettings } from '@/domain/reader-preferences';
const key='reader-settings';
export const preferencesStorage={read:():unknown=>JSON.parse(localStorage.getItem(key)||'null'),write:(settings:ReaderSettings)=>localStorage.setItem(key,JSON.stringify(settings))};
