/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORE_NAME?: string;
  readonly VITE_STORE_ADDRESS?: string;
  readonly VITE_STORE_PHONE?: string;
  readonly VITE_STORE_STRN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
