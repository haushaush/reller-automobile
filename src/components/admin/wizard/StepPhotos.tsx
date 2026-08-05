import { ChangeEvent, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Star, Trash2, Upload, ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  imagePaths: string[];
  previews: Record<string, string>;
  uploading: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (path: string) => void;
  onReorder: (paths: string[]) => void;
}

export default function StepPhotos({
  imagePaths, previews, uploading, onFiles, onRemove, onReorder,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) onFiles(files);
    e.target.value = "";
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= imagePaths.length || from === to) return;
    const next = [...imagePaths];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
  };

  const count = imagePaths.length;

  return (
    <div className="space-y-6">
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length) onFiles(files);
        }}
        className={`p-8 border-dashed border-2 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="mt-3 font-medium">Fotos hierher ziehen oder auswählen</p>
        <p className="text-sm text-muted-foreground mt-1">
          Mindestens 5 Fotos, besser 10. Inserate mit vielen Fotos bekommen deutlich mehr Anfragen.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Fotos auswählen
          </Button>
          <Button
            type="button"
            variant="outline"
            className="md:hidden"
            onClick={() => cameraInput.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4" />
            Foto aufnehmen
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={pick}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pick}
        />
      </Card>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{count} Foto{count === 1 ? "" : "s"} hochgeladen</span>
        {count > 0 && count < 5 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600">
            Empfehlung: mindestens 5
          </Badge>
        )}
      </div>

      {count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {imagePaths.map((path, index) => (
            <div
              key={path}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
              className="relative group rounded-lg overflow-hidden border bg-muted aspect-square cursor-move"
            >
              {previews[path] ? (
                <img src={previews[path]} alt={`Fahrzeugfoto ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                  wird geladen…
                </div>
              )}
              {index === 0 && (
                <Badge className="absolute top-2 left-2 gap-1">
                  <Star className="h-3 w-3" /> Titelbild
                </Badge>
              )}
              <div className="absolute bottom-1 left-1 right-1 flex justify-between gap-1">
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="secondary" className="h-7 w-7"
                    onClick={() => move(index, index - 1)} aria-label="Nach vorne">
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="secondary" className="h-7 w-7"
                    onClick={() => move(index, index + 1)} aria-label="Nach hinten">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button type="button" size="icon" variant="destructive" className="h-7 w-7"
                  onClick={() => onRemove(path)} aria-label="Foto entfernen">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Sie können diesen Schritt überspringen. Ohne Fotos lässt sich das Fahrzeug aber später nicht
        veröffentlichen.
      </p>
    </div>
  );
}
