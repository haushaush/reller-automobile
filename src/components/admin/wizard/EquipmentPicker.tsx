import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { featureHaystack, matchesSearch } from "@/lib/featureSearch";

export interface FeatureItem { key: string; label: string }
export interface FeatureGroup { id: string; title: string; items: FeatureItem[] }

interface Props {
  features: Record<string, boolean>;
  onChange: (features: Record<string, boolean>) => void;
  groups: FeatureGroup[];
  /** Wird gerufen, wenn Escape bei leerer Suche gedrückt wird. */
  onEscape?: () => void;
  /** Suchfeld beim Aufklappen fokussieren. */
  autoFocus?: boolean;
}

/**
 * Merkmalsauswahl mit Suche. Ausgewählte Merkmale bleiben während des Filterns
 * immer sichtbar, damit nicht der Eindruck entsteht, sie seien abgewählt.
 */
export default function EquipmentPicker({
  features, onChange, groups, onEscape, autoFocus,
}: Props) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>([groups[0]?.id].filter(Boolean) as string[]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const index = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      for (const i of g.items) map.set(i.key, featureHaystack(i.key, i.label));
    }
    return map;
  }, [groups]);

  const searching = query.trim().length > 0;

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selectedItems = useMemo(
    () => allItems.filter((i) => features[i.key]),
    [allItems, features],
  );

  const filteredGroups = useMemo(() => {
    if (!searching) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => !features[i.key] && matchesSearch(index.get(i.key) ?? "", query),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, searching, query, index, features]);

  const hits = filteredGroups.reduce((n, g) => n + g.items.length, 0);
  const noHits = searching && hits === 0 &&
    !selectedItems.some((i) => matchesSearch(index.get(i.key) ?? "", query));

  const toggleGroup = (id: string) =>
    setOpenGroups((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const setFeature = (key: string, on: boolean) =>
    onChange({ ...features, [key]: on });

  const resetSelection = () => {
    const next: Record<string, boolean> = { ...features };
    for (const i of allItems) delete next[i.key];
    onChange(next);
  };

  const checkbox = (f: FeatureItem) => (
    <div key={f.key} className="flex items-center gap-2">
      <Checkbox
        id={`w-${f.key}`}
        checked={!!features[f.key]}
        onCheckedChange={(c) => setFeature(f.key, c === true)}
      />
      <Label htmlFor={`w-${f.key}`} className="cursor-pointer text-sm font-normal">
        {f.label}
      </Label>
    </div>
  );

  const grid = (items: FeatureItem[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
      {items.map(checkbox)}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Suchfeld — auf dem Handy bleibt es beim Scrollen oben stehen */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              e.stopPropagation();
              if (query) setQuery("");
              else onEscape?.();
            }}
            placeholder="Ausstattung suchen…"
            className="pl-9 pr-9"
            aria-label="Ausstattung suchen"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Suche zurücksetzen"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {selectedItems.length > 0 && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Ausgewählt <span className="text-muted-foreground font-normal">({selectedItems.length})</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={resetSelection}>
              Auswahl zurücksetzen
            </Button>
          </div>
          {grid(selectedItems)}
        </div>
      )}

      {noHits ? (
        <div className="border rounded-md p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Keine Ausstattung gefunden</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
            Suche zurücksetzen
          </Button>
        </div>
      ) : (
        filteredGroups.map((g) => {
          const total = groups.find((x) => x.id === g.id)?.items ?? [];
          const count = total.filter((i) => features[i.key]).length;
          const isOpen = searching || openGroups.includes(g.id);
          return (
            <div key={g.id} className="border rounded-md">
              <button
                type="button"
                onClick={() => !searching && toggleGroup(g.id)}
                className="w-full flex items-center justify-between p-3 text-left text-sm font-medium"
                aria-expanded={isOpen}
              >
                <span>{g.title}</span>
                <span className="flex items-center gap-2 text-muted-foreground font-normal">
                  {count > 0 && <span>{count} ausgewählt</span>}
                  {!searching && (
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </span>
              </button>
              {isOpen && <div className="p-3 pt-0">{grid(g.items)}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
