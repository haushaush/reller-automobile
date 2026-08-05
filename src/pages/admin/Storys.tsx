import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StoryGenerator from "./StoryGenerator";
import StoryArchive from "./StoryArchive";

export default function Storys() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "archiv" ? "archiv" : "erstellen";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Storys</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Bilder für WhatsApp und Social Media erstellen und wiederfinden
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setSearchParams(v === "archiv" ? { tab: "archiv" } : {})}
      >
        <TabsList>
          <TabsTrigger value="erstellen">Neu erstellen</TabsTrigger>
          <TabsTrigger value="archiv">Gespeicherte Storys</TabsTrigger>
        </TabsList>
        <TabsContent value="erstellen" className="mt-6">
          <StoryGenerator />
        </TabsContent>
        <TabsContent value="archiv" className="mt-6">
          <StoryArchive />
        </TabsContent>
      </Tabs>
    </div>
  );
}
