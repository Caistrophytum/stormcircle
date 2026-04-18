import { useState } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadarStation } from "@/config/radarStations";
import { PRODUCTS, ProductCode, SelectedCity } from "@/hooks/useRadar";
import { useCitySearch } from "@/hooks/useCitySearch";

interface Props {
  selectedCity: SelectedCity | null;
  onCityChange: (city: SelectedCity) => void;
  selectedStation: RadarStation | null;
  stationDistanceKm: number | null;
  selectedProduct: ProductCode | null;
  onProductChange: (product: ProductCode) => void;
}

const RadarControls = ({
  selectedCity,
  onCityChange,
  selectedStation,
  stationDistanceKm,
  selectedProduct,
  onProductChange,
}: Props) => {
  const [cityOpen, setCityOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, loading, error } = useCitySearch(query);

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      {/* City picker - geocoded autocomplete */}
      <Popover open={cityOpen} onOpenChange={setCityOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={cityOpen}
            className="w-full justify-between font-mono text-xs h-9"
          >
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="size-3 shrink-0 text-primary" />
              {selectedCity
                ? `${selectedCity.name}`
                : "Search city..."}
            </span>
            <ChevronsUpDown className="ml-2 size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                    const label = city.admin1 ? `${city.name}, ${city.admin1}` : city.name;
                    const isSelected =
                      selectedCity?.lat === city.latitude && selectedCity?.lon === city.longitude;
                    return (
                      <CommandItem
                        key={city.id}
                        value={`${city.id}`}
                        onSelect={() => {
                          onCityChange({ name: label, lat: city.latitude, lon: city.longitude });
                          setCityOpen(false);
                        }}
                        className="font-mono text-xs"
                      >
                        <Check
                          className={cn("mr-2 size-3", isSelected ? "opacity-100" : "opacity-0")}
                        />
                        <span className="text-primary font-bold mr-2">{city.name}</span>
                        {city.admin1 && (
                          <span className="text-muted-foreground">/ {city.admin1}</span>
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

      {/* Nearest radar readout */}
      {selectedStation && selectedCity && (
        <div className="px-2 py-1.5 rounded-sm bg-primary/5 border border-primary/20 flex flex-col gap-0.5">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Nearest Radar
          </span>
          <span className="text-[11px] font-mono font-bold text-primary leading-tight">
            {selectedStation.id}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground leading-tight">
            {selectedStation.name}
            {stationDistanceKm != null && (
              <> · {Math.round(stationDistanceKm)} km</>
            )}
          </span>
        </div>
      )}

      {/* Product picker - single-column tile menu */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Available Scans
        </span>
        <div className="grid grid-cols-1 gap-1.5 flex-1 auto-rows-fr">
          {PRODUCTS.map((p) => {
            const isSelected = selectedProduct === p.code;
            const isDisabled = !selectedStation;
            return (
              <button
                key={p.code}
                type="button"
                disabled={isDisabled}
                onClick={() => onProductChange(p.code)}
                className={cn(
                  "w-full h-full flex flex-col items-start justify-center gap-0.5 px-2.5 py-2 rounded-sm border font-mono text-left leading-tight transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isSelected
                    ? "bg-primary/15 border-primary text-card-foreground"
                    : "bg-background/40 border-border hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <span className="text-[11px] font-bold text-primary">{p.code}</span>
                <span className="text-[10px] text-muted-foreground">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RadarControls;
