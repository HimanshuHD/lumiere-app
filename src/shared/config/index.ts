import { parsePublicConfig } from './public-config';
export const publicConfig = parsePublicConfig(import.meta.env);
export type { PublicConfig } from './public-config';
