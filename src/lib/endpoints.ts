/**
 * Shared external endpoint URLs. Keep a single source of truth so the
 * polling DataProvider and the new-LSR ping hook never drift apart.
 */
export const IEM_LSR_URL =
  "https://mesonet.agron.iastate.edu/geojson/lsr.py?hours=2&wfo=ALL";
