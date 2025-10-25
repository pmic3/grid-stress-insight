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

// ── Loader ─────────────────────────────────────────────────────────────────────
let cachedGeojson: any = null;

async function loadGeojson() {
  if (cachedGeojson) return cachedGeojson;

  const GITHUB_BASE = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/gis/";
  console.log("Loading GeoJSON from GitHub...");

  const res = await fetch(`${GITHUB_BASE}oneline_lines.geojson`);
  if (!res.ok) throw new Error("Failed to fetch GeoJSON file");

  const geojson = await res.json();

  // Enrich features: id, normalized kV, azimuth
  for (const feature of geojson.features) {
    const props = feature.properties ?? (feature.properties = {});
    props.id = props.id || props.Name; // stable id for coloring
    props.kV = normalizeKV(props.nomkv); // normalize voltage → kV

    const coords = getLineCoords(feature.geometry);
    props.azimuth = coords ? computeAzimuthFromCoords(coords) : 0; // 0..360°
  }

  cachedGeojson = geojson;
  console.log(`Loaded GeoJSON with ${geojson.features.length} features`);
  return cachedGeojson;
}

// ── HTTP handler ───────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const geojson = await loadGeojson();
    return new Response(JSON.stringify({ geojson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error loading grid data:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
