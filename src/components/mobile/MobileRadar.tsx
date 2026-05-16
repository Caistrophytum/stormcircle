import { useState } from "react";
import { ChevronsUpDown, Check, MapPin } from "lucide-react";
import { LeafletRadar } from "@/components/RadarMiniMap";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRadar, PRODUCTS } from "@/hooks/useRadar";
import { useCitySearch } from "@/hooks/useCitySearch";
import { cn } from "@/lib/utils";

export default function MobileRadar() {
  const {
    selectedCity,
    setSelectedCity,
    selectedStation,
    selectStationByMarker,
    selectedProduct,
    setSelectedProduct,
    tileUrl,
  } = useRadar();

  const [cityOpen, setCityOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, loading, error } = useCitySearch(query);

  const selectedProductLabel =
    PRODUCTS.find((p) => p.code === selectedProduct)?.label ?? "Select scan...";

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* Top 80% — radar map */}
      <div style={{ height: "80%", position: "relative", background: "#1a1a2e" }}>
        <LeafletRadar
          station={selectedStation}
          tileUrl={tileUrl}
          interactive
          selectedStation={selectedStation}
          onStationMarkerSelect={selectStationByMarker}
          setSelectedProduct={setSelectedProduct}
        />
      </div>

      {/* Bottom 20% — controls */}
      <div
        style={{
          height: "20%",
          display: "flex",
          gap: "8px",
          padding: "10px 12px",
          background: "rgba(10,10,14,0.95)",
          borderTop: "1px solid rgba(255,157,0,0.25)",
          alignItems: "flex-start",
        }}
      >
        {/* City search (opens upward) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Popover open={cityOpen} onOpenChange={setCityOpen}>
            <PopoverTrigger asChild>
              <button
                className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-sm font-mono text-xs"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,157,0,0.3)",
                  color: "#e8e8e8",
                }}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="size-3 shrink-0 text-primary" />
                  <span className="truncate">
                    {selectedCity ? selectedCity.name : "Search city..."}
                  </span>
                </span>
                <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-[--radix-popover-trigger-width] p-0"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Type a US city..."
                  className="h-9"
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {loading
                      ? "Searching..."
                      : error
                        ? "Search error."
                        : query.trim().length < 2
                          ? "Type at least 2 characters."
                          : "No city found."}
                  </CommandEmpty>
                  {results.length > 0 && (
                    <CommandGroup>
                      {results.map((city) => {
                        const label = city.admin1
                          ? `${city.name}, ${city.admin1}`
                          : city.name;
                        return (
                          <CommandItem
                            key={city.id}
                            value={`${city.id}`}
                            onSelect={() => {
                              setSelectedCity({
                                name: label,
                                lat: city.latitude,
                                lon: city.longitude,
                              });
                              setCityOpen(false);
                            }}
                            className="font-mono text-xs"
                          >
                            <span className="text-primary font-bold mr-2">
                              {city.name}
                            </span>
                            {city.admin1 && (
                              <span className="text-muted-foreground">
                                / {city.admin1}
                              </span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Scan picker (opens upward) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Popover open={scanOpen} onOpenChange={setScanOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={!selectedStation}
                className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-sm font-mono text-xs disabled:opacity-40"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,157,0,0.3)",
                  color: "#e8e8e8",
                }}
              >
                <span className="truncate">
                  <span className="text-primary font-bold mr-1.5">
                    {selectedProduct ?? "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {selectedProductLabel}
                  </span>
                </span>
                <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-[--radix-popover-trigger-width] p-1"
            >
              <div className="flex flex-col gap-1">
                {PRODUCTS.map((p) => {
                  const isSelected = selectedProduct === p.code;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(p.code);
                        setScanOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm font-mono text-left text-xs transition-colors",
                        isSelected
                          ? "bg-primary/15 border border-primary text-card-foreground"
                          : "border border-transparent hover:bg-primary/5",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3 shrink-0",
                          isSelected ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
                      <span className="text-primary font-bold">{p.code}</span>
                      <span className="text-muted-foreground truncate">
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
