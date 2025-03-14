import { serve } from "bun";

const API_BASE_URL = "https://data.webservice-kvb.koeln/service/opendata/";

serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/api")) {
      return new Response("❌ Not Found", { status: 404 });
    }

    // Ziel-API-URL (leitet "/api" Anfragen weiter)
    const targetUrl = API_BASE_URL + url.pathname.replace("/api", "");

    console.log(`🔗 Proxy-Anfrage an: ${targetUrl}`);

    try {
      const response = await fetch(targetUrl);
      const text = await response.text(); // Logge die vollständige Antwort

      console.log(`📥 Antwort von API: ${text.slice(0, 200)}`); // Zeigt nur die ersten 200 Zeichen
      return new Response(text, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    } catch (err) {
      console.error("❌ Fehler beim Abrufen der API:", err);
      return new Response("Fehler beim Proxy", { status: 500 });
    }
  },
});

console.log("🚀 Proxy läuft auf http://localhost:3001");
