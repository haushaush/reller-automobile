// Diagnose-Function: prüft ob der Mobile.de-Zugang Zugriff auf die Seller-API hat.
// Interpretation der Status-Codes:
//   200 → Seller-API-Zugang vorhanden (Liste der Inserate kommt zurück)
//   401 → Auth-Problem (Username/Passwort stimmt nicht für Seller-API)
//   403 → kein Seller-API-Zugang freigeschaltet
//   404 → customerId/Pfad stimmt nicht

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let scope = "standard";
  try {
    const body = await req.json();
    if (body?.scope === "accident") scope = "accident";
  } catch {
    /* ohne Angabe: Standardkonto */
  }

  const username = Deno.env.get(
    scope === "accident" ? "MOBILE_DE_ACCIDENT_USERNAME" : "MOBILE_DE_USERNAME",
  );
  const password = Deno.env.get(
    scope === "accident" ? "MOBILE_DE_ACCIDENT_PASSWORD" : "MOBILE_DE_PASSWORD",
  );

  if (!username || !password) {
    return new Response(
      JSON.stringify({ error: "Missing Mobile.de API credentials" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = "Basic " + btoa(`${username}:${password}`);
  const customerId = Number(
    (scope === "accident" ? Deno.env.get("MOBILE_DE_ACCIDENT_SELLER_ID") : null) || 451040,
  );
  const url = `https://services.mobile.de/seller-api/sellers/${customerId}/ads`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.de.mobile.api+json",
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => { headersObj[k] = v; });

    const bodyText = await res.text();
    const bodyPreview = bodyText.slice(0, 800);

    console.log("SELLER-API CHECK", { status: res.status, contentType });
    console.log("SELLER-API headers", headersObj);
    console.log("SELLER-API body preview", bodyPreview);

    return new Response(
      JSON.stringify({
        scope,
        status: res.status,
        contentType,
        bodyPreview,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("SELLER-API CHECK error", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
