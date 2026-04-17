import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { RADAR_STATIONS, RadarStation } from "@/config/radarStations";
import { PRODUCTS, ProductCode } from "@/hooks/useRadar";

interface Props {
  selectedStation: RadarStation | null;
  onStationChange: (station: RadarStation) => void;
  selectedProduct: ProductCode | null;
  onProductChange: (product: ProductCode) => void;
}

const RadarControls = ({
  selectedStation,
  onStationChange,
  selectedProduct,
  onProductChange,
}: Props) => {
  const [stationOpen, setStationOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Station picker - searchable */}
      <Popover open={stationOpen} onOpenChange={setStationOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={stationOpen}
            className="w-full justify-between font-mono text-xs h-9"
          >
            {selectedStation
              ? `${selectedStation.id} / ${selectedStation.name}`
              : "Select radar station..."}
            <ChevronsUpDown className="ml-2 size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(value, search) => {
              const v = value.toLowerCase();
              return v.includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Search by ID or city..." className="h-9" />
            <CommandList>
              <CommandEmpty>No station found.</CommandEmpty>
              <CommandGroup>
                {RADAR_STATIONS.map((station) => (
                  <CommandItem
                    key={station.id}
                    value={`${station.id} ${station.name}`}
                    onSelect={() => {
                      onStationChange(station);
                      setStationOpen(false);
                    }}
                    className="font-mono text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 size-3",
                        selectedStation?.id === station.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-primary font-bold mr-2">{station.id}</span>
                    <span className="text-muted-foreground">/ {station.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Product picker - single-column tile menu */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Available Scans
        </span>
        <div className="grid grid-cols-1 gap-1">
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
                  "w-full flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-sm border font-mono text-left leading-tight transition-colors",
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
