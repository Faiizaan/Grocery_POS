/** Store branding shown on receipts (set VITE_STORE_* in frontend/.env to override). */
function env(name: keyof ImportMetaEnv) {
  return (import.meta.env[name] as string | undefined)?.trim() || "";
}

export const STORE_NAME = env("VITE_STORE_NAME") || "Demo Grocery Store";
export const STORE_ADDRESS =
  env("VITE_STORE_ADDRESS") || "1 High Street, Anytown";
export const STORE_PHONE = env("VITE_STORE_PHONE") || "01234 567890";
export const STORE_STRN = env("VITE_STORE_STRN") || "0000000-0";
