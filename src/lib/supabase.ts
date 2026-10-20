import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface Chapter {
  title: string;
  content: string;
}

export interface Document {
  id: string;
  title: string;
  author: string;
  category: string;
  cover_url: string;
  reading_time: number;
  summary: string;
  chapters: Chapter[];
  is_featured: boolean;
  created_at: string;
  uploaded_by?: string | null;
  page_count?: number | null;
  file_url?: string | null;
  file_format?: string | null;
  file_name?: string | null;
  source_url?: string | null;
}

export interface UploadResult {
  document: Document;
}

export interface Bookmark {
  id: string;
  user_id: string;
  document_id: string;
  created_at: string;
  document?: Document;
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  document_id: string;
  chapter_index: number;
  scroll_percent: number;
  epub_cfi?: string | null;
  updated_at: string;
}

export interface ReadingListItem {
  id: string;
  user_id: string;
  document_id: string;
  created_at: string;
  document?: Document;
}
