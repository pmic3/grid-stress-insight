import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse CSV helper
function parseCSV(text: string): any[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim();
    });
    return obj;
  });
}

let cachedBuses: any = null;

async function loadBuses() {
  if (cachedBuses) return cachedBuses;

  console.log("Loading buses and lines data...");
  
  // Load from GitHub (avoid filesystem bundling issues)
  const GITHUB_BASE = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/csv/";

  const busesRes = await fetch(`${GITHUB_BASE}buses.csv`);
  if (!busesRes.ok) throw new Error("Failed to fetch buses.csv");
  const busesText = await busesRes.text();
  const busesData = parseCSV(busesText);
  
  // Load lines to compute degree (number of connected lines per bus)
  const linesRes = await fetch(`${GITHUB_BASE}lines.csv`);
  if (!linesRes.ok) throw new Error("Failed to fetch lines.csv");
  const linesText = await linesRes.text();
  const linesData = parseCSV(linesText);
  
  // Count connections per bus
  const busConnections: Record<string, number> = {};
  linesData.forEach((line: any) => {
    const bus0 = line.bus0_name?.trim() || line.bus0;
    const bus1 = line.bus1_name?.trim() || line.bus1;
    busConnections[bus0] = (busConnections[bus0] || 0) + 1;
    busConnections[bus1] = (busConnections[bus1] || 0) + 1;
  });
  
  // Build bus array
  const buses = busesData.map((bus: any) => {
    const busName = bus.BusName?.trim() || bus.name;
    return {
      id: busName,
      name: busName,
      lat: parseFloat(bus.y),
      lon: parseFloat(bus.x),
      v_nom: parseFloat(bus.v_nom),
      degree: busConnections[busName] || 0,
    };
  }).filter((b: any) => !isNaN(b.lat) && !isNaN(b.lon) && !isNaN(b.v_nom));
  
  cachedBuses = buses;
  console.log(`Loaded ${buses.length} buses`);
  return buses;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const buses = await loadBuses();
    return new Response(JSON.stringify({ buses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error loading buses:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
