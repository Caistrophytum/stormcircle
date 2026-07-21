/**
 * LocateMeButton — mobile-only affordance placed in the Welcome rectangle.
 *
 * Uses the browser Geolocation API to grab the device's coordinates, reverse
 * geocodes them via BigDataCloud's free client endpoint (no API key), then
 * validates candidate place names against Open-Meteo's geocoder so the saved
 * label is one the rest of the app can actually resolve back to coordinates
 * (hometown weather, home city risk, radar anchor all depend on that).
 */
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { searchGeocode } from "@/lib/openMeteo";

interface Props {
  userId: string;
}

interface AdminEntry {
  name?: string;
  order?: number;
  adminLevel?: number;
  isoName?: string;
}

interface ReverseGeocodeResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryCode?: string;
  localityInfo?: { administrative?: AdminEntry[] };
}

/** Match LocationPicker's formatCity so downstream label parsing is consistent. */
function formatCity(name: string, admin1?: string, countryCode?: string): string {
  const cc = (countryCode ?? "").toUpperCase();
  if (cc && cc !== "US") return [name, admin1, cc].filter(Boolean).join(", ");
  return admin1 ? `${name}, ${admin1}` : name;
}

/** Great-circle distance (km) — used to pick the geocoder hit closest to the
 * user's actual coordinates so we don't grab a same-named city on another
 * continent. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Walk candidate place names (city → locality → admin hierarchy from most
 * local to least) and return the first one Open-Meteo can geocode within
 * ~150 km of the user's real coords.
 */
async function pickResolvableCity(
  data: ReverseGeocodeResult,
  lat: number,
  lon: number,
): Promise<{ label: string } | null> {
  const admins = (data.localityInfo?.administrative ?? [])
    .filter((a): a is AdminEntry & { name: string } => !!a.name)
    // Most local (highest adminLevel) first.
    .sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0))
    .map((a) => a.name);

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of [data.city, data.locality, ...admins]) {
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }

  for (const name of candidates) {
    try {
      const results = await searchGeocode(name, 5);
      if (!results.length) continue;
      // Prefer the geocoder hit closest to the user (guards against homonyms).
      const nearest = results
        .map((r) => ({ r, d: haversineKm(lat, lon, r.latitude, r.longitude) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest.d > 150) continue;
      return {
        label: formatCity(nearest.r.name, nearest.r.admin1, nearest.r.country_code),
      };
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export default function LocateMeButton({ userId }: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not available on this device.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          );
          if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
          const data: ReverseGeocodeResult = await res.json();
          const picked = await pickResolvableCity(data, latitude, longitude);
          if (!picked) {
            toast.error("Could not identify a nearby known city.");
            return;
          }
          const { error } = await supabase
            .from("profiles")
            .update({ location: picked.label })
            .eq("id", userId);
          if (error) {
            toast.error(`Could not save location: ${error.message}`);
            return;
          }
          toast.success(`Home city set to ${picked.label}`);
          if (typeof window !== "undefined") window.location.reload();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to locate.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Unable to retrieve your location.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label="Set hometown to my current location"
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 8px",
        border: "1px solid rgba(255,157,0,0.4)",
        background: "rgba(255,157,0,0.08)",
        color: "#ff9d00",
        borderRadius: "2px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <LocateFixed className="size-3" />}
      {busy ? "Locating" : "Locate Me"}
    </button>
  );
}
