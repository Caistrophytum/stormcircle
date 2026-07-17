/**
 * LocationPicker — search-bar UI used in the Operator Profile section of the
 * Account Center to let a user set/change their saved home city. Uses
 * Open-Meteo geocoding via useCitySearch and persists to profiles.location.
 */
import { useRef, useState } from "react";
import { Loader2, MapPin, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCitySearch } from "@/hooks/useCitySearch";

interface Props {
  userId: string;
  currentLocation: string | null;
  onSaved: () => void;
}

const inputClass =
  "w-full bg-cockpit/60 border border-border focus:border-primary/60 focus:outline-none rounded-sm px-3 py-2 text-sm font-mono text-card-foreground placeholder:text-muted-foreground transition-colors disabled:opacity-60";

const LocationPicker = ({ userId, currentLocation, onSaved }: Props) => {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const { results, loading } = useCitySearch(query);
  const rowClass = pending
    ? "grid grid-cols-1 sm:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)_auto] items-stretch sm:items-center gap-2"
    : "grid grid-cols-1 sm:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] items-stretch sm:items-center gap-2";

  const formatCity = (name: string, admin1?: string, countryCode?: string) => {
    const cc = (countryCode ?? "").toUpperCase();
    if (cc && cc !== "US") return [name, admin1, cc].filter(Boolean).join(", ");
    return admin1 ? `${name}, ${admin1}` : name;
  };

  const handleSave = async (label: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ location: label })
        .eq("id", userId);
      if (error) {
        toast.error(`Could not save location: ${error.message}`);
        return;
      }
      toast.success("Home city updated");
      setQuery("");
      setPending(null);
      onSaved();
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ location: null })
        .eq("id", userId);
      if (error) {
        toast.error(`Could not clear location: ${error.message}`);
        return;
      }
      toast.success("Home city cleared");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className={rowClass}>
        {/* Current city readout */}
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-mono text-card-foreground">
          <MapPin className="size-3.5 text-primary" />
          <span className="truncate">{currentLocation ?? "No home city set"}</span>
          {currentLocation && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Clear home city"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative min-w-0">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPending(null);
            }}
            maxLength={80}
            placeholder="Search a city..."
            aria-label="Search for a city"
            className={inputClass}
            disabled={saving}
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-primary" />
          )}

          {query.trim().length >= 2 && results.length > 0 && !pending && (
            <ul
              className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto overscroll-y-contain bg-cockpit border border-border rounded-sm shadow-lg [scrollbar-gutter:stable] [touch-action:pan-y]"
              style={{ WebkitOverflowScrolling: "touch" }}
              onWheel={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight > el.clientHeight) {
                  e.preventDefault();
                  e.stopPropagation();
                  el.scrollTop += e.deltaY;
                }
              }}
              onTouchStart={(e) => {
                touchStartY.current = e.touches[0]?.clientY ?? null;
              }}
              onTouchMove={(e) => {
                const el = e.currentTarget;
                const currentY = e.touches[0]?.clientY;

                if (touchStartY.current === null || currentY === undefined) return;

                if (el.scrollHeight > el.clientHeight) {
                  const deltaY = touchStartY.current - currentY;
                  el.scrollTop += deltaY;
                  touchStartY.current = currentY;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onTouchEnd={() => {
                touchStartY.current = null;
              }}
            >
              {results.map((r) => {
                const label = formatCity(r.name, r.admin1);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setPending(label)}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-card-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                    >
                      <MapPin className="size-3 text-muted-foreground" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Save / cancel inline */}
        {pending && (
          <div className="flex items-center gap-2 justify-self-end shrink-0">
            <button
              type="button"
              onClick={() => handleSave(pending)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary text-card-foreground font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {pending && (
        <p className="text-[11px] font-mono text-muted-foreground">
          Set <span className="text-card-foreground">{pending}</span> as your home city?
        </p>
      )}
    </div>
  );
};

export default LocationPicker;
