import { serve } from "bun";
import iconv from "iconv-lite";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";

const API_BASE_URL = "https://data.webservice-kvb.koeln/service/opendata/";
const CACHE_DIR = "./cache";
const CACHE_TTL = 3600000; // Cache-Gültigkeit: 1 Stunde in Millisekunden
const PORT = 3001;

// In-Memory-Cache
const memoryCache = new Map();

// Cache-Verzeichnis erstellen (falls nicht vorhanden)
async function ensureCacheDir() {
  try {
    await access(CACHE_DIR);
  } catch (err) {
    // Verzeichnis existiert nicht, also erstellen
    await mkdir(CACHE_DIR, { recursive: true });
    console.log(`📁 Cache-Verzeichnis erstellt: ${CACHE_DIR}`);
  }
}

// Cache-Schlüssel aus URL generieren
function getCacheKey(url: string) {
  return url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Cache-Datei für URL erstellen
function getCacheFilePath(cacheKey: string) {
  return join(CACHE_DIR, `${cacheKey}.json`);
}

// Daten im Cache speichern (Memory + Datei)
async function cacheResponse(url: string, data: string, headers: object) {
  const cacheKey = getCacheKey(url);
  const cacheFilePath = getCacheFilePath(cacheKey);
  
  // Cache-Objekt
  const cacheEntry = {
    data,
    headers,
    timestamp: Date.now()
  };
  
  // In-Memory-Cache aktualisieren
  memoryCache.set(cacheKey, cacheEntry);
  
  // In Datei speichern
  try {
    await ensureCacheDir();
    await writeFile(cacheFilePath, JSON.stringify(cacheEntry), 'utf8');
    console.log(`💾 Cache gespeichert für: ${url}`);
  } catch (err: any) {
    console.error(`❌ Fehler beim Speichern des Cache: ${err.message}`);
  }
}

// Daten aus dem Cache lesen (zuerst Memory, dann Datei)
async function getCachedResponse(url: string) {
  const cacheKey = getCacheKey(url);
  
  // Zuerst im Memory-Cache suchen
  if (memoryCache.has(cacheKey)) {
    const cache = memoryCache.get(cacheKey);
    
    // Überprüfen, ob der Cache noch gültig ist
    if (Date.now() - cache.timestamp < CACHE_TTL) {
      console.log(`🔄 Gültige Daten im Memory-Cache gefunden für: ${url}`);
      return cache;
    } else {
      // Cache ist abgelaufen, aus Memory entfernen
      memoryCache.delete(cacheKey);
    }
  }
  
  // Falls nicht im Memory oder abgelaufen, in der Datei nachsehen
  const cacheFilePath = getCacheFilePath(cacheKey);
  try {
    const fileData = await readFile(cacheFilePath, 'utf8');
    const cache = JSON.parse(fileData);
    
    // Überprüfen, ob der Datei-Cache noch gültig ist
    if (Date.now() - cache.timestamp < CACHE_TTL) {
      console.log(`📂 Gültige Daten im Datei-Cache gefunden für: ${url}`);
      // In den Memory-Cache laden für schnelleren Zugriff in Zukunft
      memoryCache.set(cacheKey, cache);
      return cache;
    }
  } catch (err) {
    // Datei existiert nicht oder kann nicht gelesen werden
    console.log(`📭 Kein Cache gefunden für: ${url}`);
  }
  
  // Kein gültiger Cache gefunden
  return null;
}

// Helfer-Funktion für die Textkodierung
function getBestEncoding(buffer: Buffer) {
  // Versuche direkt als UTF-8 zu dekodieren (keine Konvertierung)
  const textUTF8 = buffer.toString();
  
  // Überprüfe UTF-8 auf gültige Umlaute (Stichprobe)
  const hasValidUmlauts = textUTF8.includes('ä') || textUTF8.includes('ö') ||
    textUTF8.includes('ü') || textUTF8.includes('ß');
  
  // Falls UTF-8 gültig erscheint, verwende es direkt
  if (hasValidUmlauts) {
    console.log("🔤 Verwende direkt UTF-8 (keine Konvertierung)");
    return { text: textUTF8, encoding: "utf-8" };
  }
  
  // Wenn UTF-8 nicht gültig ist, probiere andere Kodierungen
  // Gängige Kodierungen für deutsche Texte
  const encodings = ["iso-8859-1", "iso-8859-15", "windows-1252"];
  
  for (const encoding of encodings) {
    const convertedText = iconv.decode(buffer, encoding);
    const hasUmlauts = convertedText.includes('ä') || convertedText.includes('ö') ||
      convertedText.includes('ü') || convertedText.includes('ß');
    
    console.log(`🔤 Test ${encoding}: Umlaute gefunden: ${hasUmlauts}`);
    
    if (hasUmlauts) {
      return { text: convertedText, encoding };
    }
  }
  
  // Fallback, wenn keine passende Kodierung gefunden wurde
  return { text: textUTF8, encoding: "utf-8" };
}

// Server starten
await ensureCacheDir();

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (!url.pathname.startsWith("/api")) {
      return new Response("❌ Not Found", { status: 404 });
    }
    
    const targetUrl = API_BASE_URL + url.pathname.replace("/api", "");
    console.log(`🔗 Proxy-Anfrage an: ${targetUrl}`);
    
    try {
      // Versuche zuerst einen Cache-Hit zu bekommen
      const cachedResponse = await getCachedResponse(targetUrl);
      
      if (cachedResponse) {
        console.log(`✅ Cache-Hit für: ${targetUrl}`);
        return new Response(cachedResponse.data, {
          headers: {
            ...cachedResponse.headers,
            "X-Cache": "HIT",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
          }
        });
      }
      
      // Wenn kein Cache, dann Live-Anfrage stellen
      console.log(`🌐 Live-Anfrage an: ${targetUrl}`);
      const response = await fetch(targetUrl);
      const contentType = response.headers.get("Content-Type") || "text/plain";
      console.log(`📜 Content-Type: ${contentType}`);
      
      // API-Daten als Binärdaten abrufen
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Beste Kodierung ermitteln und Text konvertieren
      const { text, encoding } = getBestEncoding(buffer);
      console.log(`🔤 Verwende Kodierung: ${encoding}`);
      
      // Response-Header vorbereiten
      const responseHeaders = {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "X-Cache": "MISS",
        "X-Original-Encoding": encoding
      };
      
      // Antwort im Cache speichern
      await cacheResponse(targetUrl, text, responseHeaders);
      
      // Antwort senden
      return new Response(text, {
        status: response.status,
        headers: responseHeaders
      });
    } catch (err: any) {
      console.error(`❌ Fehler beim Abrufen der API: ${err.message}`);
      
      // Im Fehlerfall: Versuche aus dem Cache zu bedienen, auch wenn abgelaufen
      try {
        const cacheKey = getCacheKey(targetUrl);
        const cacheFilePath = getCacheFilePath(cacheKey);
        const fileData = await readFile(cacheFilePath, 'utf8');
        const cache = JSON.parse(fileData);
        
        console.log(`🔄 Verwende abgelaufenen Cache für: ${targetUrl}`);
        
        return new Response(cache.data, {
          headers: {
            ...cache.headers,
            "X-Cache": "STALE",
            "X-Cache-Age": `${Math.floor((Date.now() - cache.timestamp) / 1000)}s`,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
          }
        });
      } catch (cacheErr: any) {
        // Wenn auch kein Cache verfügbar ist, Fehler zurückgeben
        console.error(`❌ Kein Cache verfügbar: ${cacheErr.message}`);
        return new Response("Service nicht verfügbar", { 
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Retry-After": "300" // Nach 5 Minuten erneut versuchen
          }
        });
      }
    }
  },
});

console.log(`🚀 Proxy mit Cache läuft auf http://localhost:${PORT}`);