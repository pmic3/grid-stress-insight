import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
