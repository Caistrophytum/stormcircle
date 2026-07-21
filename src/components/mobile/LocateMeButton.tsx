/**
 * LocateMeButton — mobile-only affordance placed in the Welcome rectangle.
 *
 * Uses the browser Geolocation API to grab the device's coordinates, reverse
 * geocodes them via BigDataCloud's free client endpoint (no API key), and
 * writes the resulting "City, Admin1[, CC]" string to profiles.location so
 * the rest of the app (hometown weather, home city risk, radar anchor) picks
 * it up on the next reload.
 */
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

interface ReverseGeocodeResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryCode?: string;
}

/** Match LocationPicker's formatCity so downstream label parsing is consistent. */
function formatCity(name: string, admin1?: string, countryCode?: string): string {
  const cc = (countryCode ?? "").toUpperCase();
  if (cc && cc !== "US") return [name, admin1, cc].filter(Boolean).join(", ");
  return admin1 ? `${name}, ${admin1}` : name;
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
          const cityName = data.city || data.locality;
          if (!cityName) {
            toast.error("Could not identify a nearby city.");
            return;
          }
          const label = formatCity(cityName, data.principalSubdivision, data.countryCode);
          const { error } = await supabase
            .from("profiles")
            .update({ location: label })
            .eq("id", userId);
          if (error) {
            toast.error(`Could not save location: ${error.message}`);
            return;
          }
          toast.success(`Home city set to ${label}`);
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
