import type { VehicleCategoryKey } from "@/lib/categories";

export interface QuickTabOption {
  label: string;
  value: VehicleCategoryKey[];
  /** Stable key for React + active comparison */
  key: string;
}

interface CategoryQuickTabsProps {
  options: QuickTabOption[];
  activeKey: string;
  onSelect: (opt: QuickTabOption) => void;
}

const CategoryQuickTabs = ({ options, activeKey, onSelect }: CategoryQuickTabsProps) => {
  return (
    <div className="flex items-center justify-center gap-2 md:gap-6 mb-8 border-b border-border">
      {options.map((opt) => {
        const active = opt.key === activeKey;
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt)}
            className={`relative px-3 md:px-4 py-3 text-sm md:text-base font-medium transition-colors ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
            <span
              className={`absolute left-0 right-0 -bottom-px h-0.5 transition-colors ${
                active ? "bg-primary" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};

export default CategoryQuickTabs;
