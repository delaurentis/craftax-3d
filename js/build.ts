// Which build of the game this is: false for `npm run dev` and plain builds; a host's release build sets VITE_SHIPPED=1
// (playcraftax's `npm run build`), so the debug-only switches (?god) never reach its site
export const SHIPPED = import.meta.env.VITE_SHIPPED === "1";
