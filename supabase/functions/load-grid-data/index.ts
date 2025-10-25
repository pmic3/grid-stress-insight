import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for grid data
let cachedGeojson: any = null;

async function loadGeojson() {
  if (cachedGeojson) return cachedGeojson;

  const GITHUB_BASE = 'https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/gis/';
  
  console.log('Loading GeoJSON from GitHub...');
  
  const geojsonRes = await fetch(`${GITHUB_BASE}oneline_lines.geojson`);

  if (!geojsonRes.ok) {
    throw new Error('Failed to fetch GeoJSON file');
  }

  const geojson = await geojsonRes.json();

  // Add id to GeoJSON features based on Name property
  geojson.features.forEach((feature: any) => {
    feature.properties.id = feature.properties.Name;
  });

  cachedGeojson = geojson;
  console.log(`Loaded GeoJSON with ${geojson.features.length} features`);
  
  return cachedGeojson;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const geojson = await loadGeojson();

    return new Response(JSON.stringify({ geojson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error loading grid data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
