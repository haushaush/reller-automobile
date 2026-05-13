// Generate vehicle "story" mockup images (1080x1920) and email them to the dealer.
// Requires the caller to be an authenticated admin user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const DEALER_EMAIL_PRIMARY = "dennis@haushhaush.de";
const DEALER_EMAIL_SECONDARY = "admin@haushhaush.de";
const SALES_EMAIL = "verkauf@reller-automobile.de";

interface RequestBody {
  vehicleIds: string[];
  forceResend?: boolean;
}

interface VehicleRow {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  image_urls: string[] | null;
  mileage: number | null;
  year: string | null;
  fuel: string | null;
}

async function generateStoryImage(vehicle: VehicleRow): Promise<string | null> {
  const sourceImage = vehicle.image_urls?.[0];
  if (!sourceImage) return null;

  const priceText = vehicle.price ? `${vehicle.price.toLocaleString("de-DE")} €` : "Auf Anfrage";
  const prompt = `Create a vertical 9:16 social media story mockup (1080x1920) for a car dealership. 
Use this car photo as the hero image, centered. Add a clean overlay with:
- Top: "RELLER AUTOMOBILE" in elegant uppercase letters
- Bottom: "${vehicle.title}" headline
- Bottom CTA badge: "${priceText}"
Style: minimal, premium, white/black palette with subtle shadows. Professional automotive marketing.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceImage } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!resp.ok) {
    console.error("AI image gen failed:", resp.status, await resp.text());
    return null;
  }
  const json = await resp.json();
  const imageB64: string | undefined = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  return imageB64 ?? null;
}

async function uploadStoryImage(
  admin: ReturnType<typeof createClient>,
  vehicleId: string,
  dataUrl: string,
): Promise<string | null> {
  const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.split("/")[1] ?? "png";
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  const path = `${vehicleId}/${Date.now()}.${ext}`;
  const { error } = await admin.storage
    .from("vehicle-stories")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) {
    console.error("Storage upload failed:", error);
    return null;
  }
  const { data } = admin.storage.from("vehicle-stories").getPublicUrl(path);
  return data.publicUrl;
}

async function sendDealerEmail(vehicle: VehicleRow, storyUrl: string) {
  if (!RESEND_API_KEY) return;
  const recipients = Array.from(
    new Set([DEALER_EMAIL_PRIMARY, DEALER_EMAIL_SECONDARY, SALES_EMAIL].filter(Boolean)),
  );
  const html = `
    <h2>Neue Story für ${vehicle.title}</h2>
    <p>Eine neue Story wurde generiert.</p>
    <p><a href="${storyUrl}">Story-Bild öffnen</a></p>
    <p><img src="${storyUrl}" alt="Story" style="max-width: 360px; border-radius: 12px;" /></p>
  `;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Reller Portal <noreply@reller-automobile.de>",
      to: recipients,
      subject: `Story erstellt: ${vehicle.title}`,
      html,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check: user must be admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.vehicleIds) || body.vehicleIds.length === 0) {
      return new Response(JSON.stringify({ error: "vehicleIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: vehicles } = await admin
      .from("vehicles")
      .select("id, title, brand, price, image_urls, mileage, year, fuel")
      .in("id", body.vehicleIds);

    let generated = 0;
    for (const v of (vehicles ?? []) as VehicleRow[]) {
      try {
        const dataUrl = await generateStoryImage(v);
        if (!dataUrl) continue;
        const publicUrl = await uploadStoryImage(admin, v.id, dataUrl);
        if (!publicUrl) continue;
        await admin.from("vehicle_stories").insert({
          vehicle_id: v.id,
          story_image_url: publicUrl,
          generated_by: user.id,
          sent_to_dealer: !!RESEND_API_KEY,
          sent_at: RESEND_API_KEY ? new Date().toISOString() : null,
        });
        await sendDealerEmail(v, publicUrl);
        generated++;
      } catch (err) {
        console.error("Story failed for", v.id, err);
      }
    }

    return new Response(JSON.stringify({ generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
