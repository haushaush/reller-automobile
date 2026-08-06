import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Erstes Baujahr, das ausgewählt werden kann. */
export const FIRST_YEAR = 1900;

export function yearOptions(): string[] {
  const max = new Date().getFullYear() + 1;
  const out: string[] = [];
  for (let y = max; y >= FIRST_YEAR; y--) out.push(String(y));
  return out;
}

interface Props {
  value: string;
  onChange: (year: string) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Jahresauswahl von 1900 bis zum laufenden Jahr plus eins — absteigend, mit
 * Eingabefeld zum Filtern, damit die lange Liste bedienbar bleibt.
 */
export default function YearCombobox({ value, onChange, placeholder = "Jahr", id }: Props) {
  const [open, setOpen] = useState(false);
  const years = useMemo(yearOptions, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value || placeholder}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Jahr eingeben…" inputMode="numeric" />
          <CommandList className="max-h-72">
            <CommandEmpty>Kein Jahr gefunden.</CommandEmpty>
            <CommandGroup>
              {years.map((y) => (
                <CommandItem
                  key={y}
                  value={y}
                  onSelect={() => { onChange(y); setOpen(false); }}
                >
                  <Check className={cn("h-4 w-4", value === y ? "opacity-100" : "opacity-0")} />
                  {y}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
