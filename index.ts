import { serve } from "bun";
import iconv from "iconv-lite";

const API_BASE_URL = "https://data.webservice-kvb.koeln/service/opendata/";

serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/api")) {
      return new Response("❌ Not Found", { status: 404 });
    }

    const targetUrl = API_BASE_URL + url.pathname.replace("/api", "");
    console.log(`🔗 Proxy-Anfrage an: ${targetUrl}`);

    try {
      const response = await fetch(targetUrl);
      const contentType = response.headers.get("Content-Type") || "text/plain";

      console.log(`📜 Content-Type: ${contentType}`);

      // API-Daten als Binärdaten abrufen
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Automatische Erkennung der Kodierung testen (optional)
      const textISO = iconv.decode(buffer, "ISO-8859-2"); // Versuche ISO-8859-2
      const textUTF8 = buffer.toString("utf-8"); // Direkt als UTF-8 interpretieren

      // console.log(`🔍 Erste 200 Zeichen (ISO-8859-2): ${textISO}`);
      console.log(`🔍 Erste 200 Zeichen (UTF-8): ${textUTF8}`);

      // Entscheide, ob du ISO oder UTF-8 zurückgibst
      const finalText = iconv.encode(textISO, "utf-8").toString("utf-8");

      return new Response(finalText, {
        status: response.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Cache-Control": "no-cache",
        },
      });
      
    } catch (err) {
      console.error("❌ Fehler beim Abrufen der API:", err);
      return new Response("Fehler beim Proxy", { status: 500 });
    }
  },
});

console.log("🚀 Proxy läuft auf http://localhost:3001");
