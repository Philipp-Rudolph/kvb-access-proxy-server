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
      
      // Versuche direkt als UTF-8 zu dekodieren (keine Konvertierung)
      const textUTF8 = buffer.toString();
      
      // Überprüfe UTF-8 auf gültige Umlaute (Stichprobe)
      const hasValidUmlauts = textUTF8.includes('ä') || textUTF8.includes('ö') || 
                              textUTF8.includes('ü') || textUTF8.includes('ß');
      
      console.log(`✓ UTF-8 Umlaute erkannt: ${hasValidUmlauts}`);
      
      // Falls UTF-8 gültig erscheint, verwende es direkt
      if (hasValidUmlauts) {
        console.log("🔤 Verwende direkt UTF-8 (keine Konvertierung)");
        return new Response(textUTF8, {
          status: response.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Cache-Control": "no-cache",
          },
        });
      }
      
      // Wenn UTF-8 nicht gültig ist, probiere andere Kodierungen
      // Gängige Kodierungen für deutsche Texte
      const encodings = ["iso-8859-1", "iso-8859-15", "windows-1252"];
      let bestText = textUTF8;
      let bestEncoding = "utf-8";
      
      for (const encoding of encodings) {
        const convertedText = iconv.decode(buffer, encoding);
        const hasUmlauts = convertedText.includes('ä') || convertedText.includes('ö') || 
                          convertedText.includes('ü') || convertedText.includes('ß');
        
        console.log(`🔤 Test ${encoding}: Umlaute gefunden: ${hasUmlauts}`);
        
        if (hasUmlauts) {
          bestText = convertedText;
          bestEncoding = encoding;
          break;
        }
      }
      
      console.log(`🔤 Verwende Kodierung: ${bestEncoding}`);
      
      return new Response(bestText, {
        status: response.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
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