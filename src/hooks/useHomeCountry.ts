/**
 * useHomeCountry - resolves the ISO country code of the signed-in user's saved
 * hometown (profile.location). Geocoding is cached in localStorage so the
 * lookup runs at most once per label per browser.
 */
import { useEffect, useState } from "react";
import { geocodeLabel } from "@/lib/openMeteo";
import { useAuth } from "@/hooks/useAuth";

const CACHE_KEY = "home-country-v1";

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function useHomeCountry(): string | null {
  const { profile } = useAuth();
  const label = profile?.location ?? null;
  const [country, setCountry] = useState<string | null>(() =>
    label ? (readCache()[label] ?? null) : null,
  );

  useEffect(() => {
    if (!label) {
      setCountry(null);
      return;
    }
    const cached = readCache()[label];
    if (cached) {
      setCountry(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await geocodeLabel(label);
      if (cancelled) return;
      const cc = res?.countryCode ?? null;
      setCountry(cc);
      if (cc) {
        const next = { ...readCache(), [label]: cc };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* quota - ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [label]);

  return country;
}
