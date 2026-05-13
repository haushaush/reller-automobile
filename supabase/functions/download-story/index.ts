import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const storyId = url.searchParams.get("storyId");

    if (!storyId) {
      return new Response(JSON.stringify({ error: "storyId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: story, error: storyError } = await supabase
      .from("vehicle_stories")
      .select("story_image_url, vehicle:vehicles(title, brand)")
      .eq("id", storyId)
      .single();

    if (storyError || !story) {
      return new Response(JSON.stringify({ error: "Story not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pathMatch = (story.story_image_url as string).match(
      /\/vehicle-stories\/(.+?)(\?|$)/
    );
    if (!pathMatch) {
      return new Response(JSON.stringify({ error: "Invalid story URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: imageData, error: imageError } = await supabase.storage
      .from("vehicle-stories")
      .download(pathMatch[1]);

    if (imageError || !imageData) {
      return new Response(JSON.stringify({ error: "Image not found in storage" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicle = (story.vehicle as { title: string; brand: string | null } | null) ?? {
      title: "Story",
      brand: "Reller",
    };
    const safeName = `${vehicle.brand || "Reller"}-${vehicle.title}`
      .replace(/[^a-zA-Z0-9\-]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 60);
    const filename = `${safeName}-Story.png`;

    return new Response(imageData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
