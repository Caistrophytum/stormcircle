/**
 * euRadarStations.ts - European (EUMETNET/OPERA) weather radar sites.
 *
 * The European view uses a single national-network composite for the imagery
 * (there is no per-site product service like NEXRAD), but we still plot the
 * physical radar sites so the map reads exactly like the US view: click a site
 * to centre the radar on it.
 *
 * Coordinates are approximate site locations from the OPERA radar database.
 * `cc` is the ISO country code, used when a marker click adopts the site as
 * the selected city.
 */

import { RadarStation } from "@/config/radarStations";

export interface EuRadarStation extends RadarStation {
  cc: string;
}

/** Prefix used to tell EU sites apart from NEXRAD ids elsewhere in the app. */
export const EU_STATION_PREFIX = "EU-";

export const EU_RADAR_STATIONS: EuRadarStation[] = [
  // United Kingdom & Ireland
  { id: "EU-UK01", name: "Chenies, UK", cc: "GB", lat: 51.688, lon: -0.531 },
  { id: "EU-UK02", name: "Hameldon Hill, UK", cc: "GB", lat: 53.756, lon: -2.135 },
  { id: "EU-UK03", name: "Clee Hill, UK", cc: "GB", lat: 52.398, lon: -2.597 },
  { id: "EU-UK04", name: "Cobbacombe, UK", cc: "GB", lat: 50.981, lon: -3.454 },
  { id: "EU-UK05", name: "Munduff Hill, UK", cc: "GB", lat: 56.196, lon: -3.311 },
  { id: "EU-UK06", name: "Druim a Starraig, UK", cc: "GB", lat: 58.211, lon: -6.777 },
  { id: "EU-IE01", name: "Dublin, IE", cc: "IE", lat: 53.427, lon: -6.242 },
  { id: "EU-IE02", name: "Shannon, IE", cc: "IE", lat: 52.692, lon: -8.925 },

  // France
  { id: "EU-FR01", name: "Trappes, FR", cc: "FR", lat: 48.775, lon: 2.008 },
  { id: "EU-FR02", name: "Bordeaux, FR", cc: "FR", lat: 44.831, lon: -0.692 },
  { id: "EU-FR03", name: "Nimes, FR", cc: "FR", lat: 43.807, lon: 4.502 },
  { id: "EU-FR04", name: "Lyon, FR", cc: "FR", lat: 45.103, lon: 4.884 },
  { id: "EU-FR05", name: "Brest, FR", cc: "FR", lat: 48.461, lon: -4.410 },
  { id: "EU-FR06", name: "Toulouse, FR", cc: "FR", lat: 43.575, lon: 1.376 },
  { id: "EU-FR07", name: "Nancy, FR", cc: "FR", lat: 48.716, lon: 6.581 },
  { id: "EU-FR08", name: "Nantes, FR", cc: "FR", lat: 47.338, lon: -1.677 },

  // Iberia
  { id: "EU-ES01", name: "Madrid, ES", cc: "ES", lat: 40.175, lon: -3.717 },
  { id: "EU-ES02", name: "Barcelona, ES", cc: "ES", lat: 41.409, lon: 1.885 },
  { id: "EU-ES03", name: "Valencia, ES", cc: "ES", lat: 39.181, lon: -0.253 },
  { id: "EU-ES04", name: "Sevilla, ES", cc: "ES", lat: 37.687, lon: -6.334 },
  { id: "EU-ES05", name: "A Coruna, ES", cc: "ES", lat: 43.168, lon: -8.527 },
  { id: "EU-PT01", name: "Lisboa, PT", cc: "PT", lat: 38.882, lon: -9.055 },
  { id: "EU-PT02", name: "Arouca, PT", cc: "PT", lat: 40.918, lon: -8.317 },

  // Benelux
  { id: "EU-NL01", name: "De Bilt, NL", cc: "NL", lat: 52.103, lon: 5.179 },
  { id: "EU-NL02", name: "Den Helder, NL", cc: "NL", lat: 52.953, lon: 4.790 },
  { id: "EU-BE01", name: "Wideumont, BE", cc: "BE", lat: 49.914, lon: 5.505 },
  { id: "EU-BE02", name: "Jabbeke, BE", cc: "BE", lat: 51.192, lon: 3.064 },
  { id: "EU-LU01", name: "Neunhausen, LU", cc: "LU", lat: 49.847, lon: 5.898 },

  // Germany
  { id: "EU-DE01", name: "Hannover, DE", cc: "DE", lat: 52.460, lon: 9.694 },
  { id: "EU-DE02", name: "Berlin-Prötzel, DE", cc: "DE", lat: 52.649, lon: 13.858 },
  { id: "EU-DE03", name: "Dresden, DE", cc: "DE", lat: 51.125, lon: 13.769 },
  { id: "EU-DE04", name: "München, DE", cc: "DE", lat: 48.331, lon: 11.612 },
  { id: "EU-DE05", name: "Essen, DE", cc: "DE", lat: 51.406, lon: 6.967 },
  { id: "EU-DE06", name: "Hamburg, DE", cc: "DE", lat: 53.559, lon: 9.698 },
  { id: "EU-DE07", name: "Feldberg, DE", cc: "DE", lat: 47.874, lon: 8.004 },

  // Alpine / Central Europe
  { id: "EU-CH01", name: "Albis, CH", cc: "CH", lat: 47.284, lon: 8.512 },
  { id: "EU-CH02", name: "La Dôle, CH", cc: "CH", lat: 46.425, lon: 6.099 },
  { id: "EU-AT01", name: "Wien, AT", cc: "AT", lat: 48.331, lon: 16.371 },
  { id: "EU-AT02", name: "Salzburg, AT", cc: "AT", lat: 47.796, lon: 13.079 },
  { id: "EU-CZ01", name: "Praha-Brdy, CZ", cc: "CZ", lat: 49.658, lon: 13.818 },
  { id: "EU-CZ02", name: "Skalky, CZ", cc: "CZ", lat: 49.501, lon: 16.790 },
  { id: "EU-SK01", name: "Bratislava, SK", cc: "SK", lat: 48.256, lon: 17.153 },
  { id: "EU-PL01", name: "Warszawa, PL", cc: "PL", lat: 52.405, lon: 20.961 },
  { id: "EU-PL02", name: "Kraków, PL", cc: "PL", lat: 50.114, lon: 20.080 },
  { id: "EU-PL03", name: "Gdańsk, PL", cc: "PL", lat: 54.384, lon: 18.456 },
  { id: "EU-HU01", name: "Budapest, HU", cc: "HU", lat: 47.396, lon: 19.180 },
  { id: "EU-SI01", name: "Ljubljana, SI", cc: "SI", lat: 46.068, lon: 14.239 },
  { id: "EU-HR01", name: "Zagreb, HR", cc: "HR", lat: 45.822, lon: 15.983 },

  // Nordics & Baltics
  { id: "EU-DK01", name: "København, DK", cc: "DK", lat: 55.173, lon: 12.100 },
  { id: "EU-DK02", name: "Rømø, DK", cc: "DK", lat: 55.173, lon: 8.552 },
  { id: "EU-NO01", name: "Oslo, NO", cc: "NO", lat: 59.978, lon: 10.203 },
  { id: "EU-NO02", name: "Bergen, NO", cc: "NO", lat: 60.630, lon: 5.230 },
  { id: "EU-SE01", name: "Stockholm, SE", cc: "SE", lat: 59.654, lon: 17.947 },
  { id: "EU-SE02", name: "Göteborg, SE", cc: "SE", lat: 57.302, lon: 12.085 },
  { id: "EU-SE03", name: "Luleå, SE", cc: "SE", lat: 65.431, lon: 21.865 },
  { id: "EU-FI01", name: "Helsinki, FI", cc: "FI", lat: 60.272, lon: 24.869 },
  { id: "EU-FI02", name: "Kuopio, FI", cc: "FI", lat: 62.863, lon: 27.381 },
  { id: "EU-EE01", name: "Tallinn, EE", cc: "EE", lat: 59.393, lon: 24.602 },
  { id: "EU-LV01", name: "Riga, LV", cc: "LV", lat: 56.899, lon: 24.058 },
  { id: "EU-LT01", name: "Vilnius, LT", cc: "LT", lat: 54.640, lon: 25.117 },

  // Italy & Southeast Europe
  { id: "EU-IT01", name: "Roma, IT", cc: "IT", lat: 41.940, lon: 12.520 },
  { id: "EU-IT02", name: "Milano, IT", cc: "IT", lat: 45.463, lon: 9.180 },
  { id: "EU-IT03", name: "Napoli, IT", cc: "IT", lat: 40.859, lon: 14.320 },
  { id: "EU-IT04", name: "Bari, IT", cc: "IT", lat: 41.117, lon: 16.867 },
  { id: "EU-IT05", name: "Sicilia, IT", cc: "IT", lat: 37.100, lon: 14.800 },
  { id: "EU-GR01", name: "Athina, GR", cc: "GR", lat: 37.936, lon: 23.947 },
  { id: "EU-GR02", name: "Thessaloniki, GR", cc: "GR", lat: 40.520, lon: 22.970 },
  { id: "EU-RO01", name: "București, RO", cc: "RO", lat: 44.500, lon: 26.117 },
  { id: "EU-BG01", name: "Sofia, BG", cc: "BG", lat: 42.650, lon: 23.383 },
  { id: "EU-RS01", name: "Beograd, RS", cc: "RS", lat: 44.767, lon: 20.483 },
  { id: "EU-TR01", name: "İstanbul, TR", cc: "TR", lat: 41.100, lon: 28.800 },
  { id: "EU-TR02", name: "Ankara, TR", cc: "TR", lat: 39.950, lon: 32.700 },
  { id: "EU-CY01", name: "Larnaca, CY", cc: "CY", lat: 34.900, lon: 33.617 },

  // Israel
  { id: "EU-IL01", name: "Bet Dagan, IL", cc: "IL", lat: 32.007, lon: 34.814 },
  { id: "EU-IL02", name: "Shacham (Ness Ziona), IL", cc: "IL", lat: 31.928, lon: 34.788 },
];

/** Nearest European radar site to a coordinate (great-circle, km). */
export function findNearestEuStation(
  lat: number,
  lon: number,
): { station: EuRadarStation; distanceKm: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  let best = EU_RADAR_STATIONS[0];
  let bestD = Infinity;
  for (const s of EU_RADAR_STATIONS) {
    const dLat = toRad(s.lat - lat);
    const dLon = toRad(s.lon - lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLon / 2) ** 2;
    const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { station: best, distanceKm: bestD };
}
