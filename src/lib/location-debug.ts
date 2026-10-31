/**
 * Opt-in diagnostic logging for the location flow (search → selection → save → map). Off by default.
 *
 *  - Browser: run `localStorage.fbLocationDebug = '1'` in the console and reload; entries go to that
 *    browser's own console only (a user's location never leaves their device through this).
 *  - Server:  set LOCATION_DEBUG=true. Logs coordinates and addresses to the server console, so never
 *    enable it in production.
 */
export function debugLocation(stage: string, data: unknown) {
  let enabled = false;
  if (typeof window === 'undefined') {
    enabled = process.env.LOCATION_DEBUG === 'true';
  } else {
    try {
      enabled = window.localStorage.getItem('fbLocationDebug') === '1';
    } catch {
      enabled = false;
    }
  }
  if (enabled) console.info(`[location] ${stage}`, JSON.stringify(data));
}
