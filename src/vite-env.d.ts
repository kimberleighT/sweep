/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** YesGaffa Supabase project URL — shared project, sweepstake lives in its own schema. */
  readonly VITE_SUPABASE_URL?: string;
  /** YesGaffa Supabase anon key. Only the sweepstake RPC layer is reachable with it. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
