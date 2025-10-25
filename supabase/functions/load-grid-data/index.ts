import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizeKV(raw: any): number {
  const v = parseFloat(raw);
  if (!isFinite(v) || v <= 0) return 115; // sensible default
  if (v > 1000) return v / 1000; // Volts → kV (e.g., 69000 → 69)
  if (v < 1) return v * 1000; // MV → kV (e.g., 0.115 → 115)
  return v; // already kV
}

function getLineCoords(geom: any): number[][] | null {
  if (!geom) return null;
  if (geom.type === "LineString") return geom.coordinates as number[][];
  if (geom.type === "MultiLineString" && geom.coordinates?.length > 0) {
    return geom.coordinates[0] as number[][];
  }
  return null;
}

function computeAzimuthFromCoords(coords: number[][]): number {
  if (!coords || coords.length < 2) return 0;
  const [lon1, lat1] = coords[0];
  const [lon2, lat2] = coords[coords.length - 1];
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1),
    φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360; // 0..360°
}

let cachedGeojson: any = null;

async function loadGeojson() {
  if (cachedGeojson) {
    return cachedGeojson;
  }
  
  console.log('Loading GeoJSON from local file...');
  
  try {
    const geojsonPath = new URL('../_shared/data/oneline_lines.geojson', import.meta.url);
    const geojsonText = await Deno.readTextFile(geojsonPath);
    const geojson = JSON.parse(geojsonText);
    
    for (const feature of geojson.features) {
      if (!feature.properties.id) {
        feature.properties.id = feature.properties.Name || feature.properties.LineName;
      }
      
      feature.properties.kV = normalizeKV(feature.properties.nomkv);
      
      const coords = getLineCoords(feature.geometry);
      if (coords) {
        feature.properties.azimuth = computeAzimuthFromCoords(coords);
      }
    }
    
    console.log(`Loaded GeoJSON with ${geojson.features.length} features`);
    cachedGeojson = geojson;
    return geojson;
  } catch (error) {
    console.error('Error loading GeoJSON:', error);
    throw error;
  }
}

// ── HTTP handler ───────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const geojson = await loadGeojson();
    
    return new Response(JSON.stringify(geojson), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
