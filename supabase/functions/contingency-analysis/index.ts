import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContingencyRequest {
  tempC: number;
  windMS: number;
  windDeg: number;
  scenario: string;
}

interface LineData {
  id: string;
  bus0: number;
  bus1: number;
  name: string;
  conductor: string;
  p0_nominal: number;
  kV: number;
  MOT: number;
}

interface ContingencyIssue {
  line: string;
  stress: number;
}

interface ContingencyResult {
  outage: string;
  issues: ContingencyIssue[];
  maxStress: number;
}

// IEEE-738 ampacity calculation (simplified version from compute-ratings)
const conductorLibrary: Record<string, any> = {
  "795 ACSR 26/7 DRAKE": { diam_mm: 28.14, r25_ohm_km: 0.07240, alpha: 0.00404 },
  "556.5 ACSR 26/7 DOVE": { diam_mm: 23.01, r25_ohm_km: 0.1039, alpha: 0.00404 },
  "1272 ACSR 45/7 BITTERN": { diam_mm: 35.10, r25_ohm_km: 0.04559, alpha: 0.00404 },
  "336.4 ACSR 30/7 ORIOLE": { diam_mm: 17.90, r25_ohm_km: 0.1723, alpha: 0.00404 },
};

function ieee738Ampacity(
  conductor: string,
  tempC: number,
  windMS: number,
  azimuthDeg: number,
  windDeg: number,
  MOT: number
): number {
  const params = conductorLibrary[conductor];
  if (!params) return 500; // Default fallback

  const D = params.diam_mm / 1000;
  const Tavg = (tempC + MOT) / 2;
  const Rfilm = 0.000055 * (Tavg + 273.15) ** 0.5;
  const mu = 1.458e-6 * (Tavg + 273.15) ** 1.5 / (Tavg + 383.4);
  const Re = (windMS * D) / mu;
  const kf = 0.024 * (0.8 + 0.2 * Math.min(Re / 1000, 1));
  const h_conv = kf * (Tavg - tempC) / D;

  const attackAngle = Math.abs(((azimuthDeg - windDeg + 180) % 360) - 180);
  const windFactor = 0.5 + 0.5 * Math.cos((attackAngle * Math.PI) / 180);
  const qc = h_conv * windFactor;

  const eps = 0.8;
  const sigma = 5.67e-8;
  const qr = eps * sigma * ((MOT + 273.15) ** 4 - (tempC + 273.15) ** 4);

  const qs = 0; // Simplified, no solar gain
  const deltaT = MOT - tempC;
  const R_MOT = params.r25_ohm_km * (1 + params.alpha * (MOT - 25)) / 1000;

  const I = Math.sqrt((qc + qr - qs) / R_MOT);
  return Math.max(I, 100);
}

function computeLineStress(actualA: number, ratingA: number): number {
  return ratingA > 0 ? (actualA / ratingA) * 100 : 0;
}

async function loadGridData(): Promise<Map<string, LineData>> {
  // Use GitHub source (preferred), fallback to bundled _shared CSVs
  const GITHUB_BASE = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/csv/";

  try {
    console.log('Fetching grid data from GitHub...');
    const [linesRes, flowsRes] = await Promise.all([
      fetch(`${GITHUB_BASE}lines.csv`),
      fetch(`${GITHUB_BASE}line_flows_nominal.csv`)
    ]);

    if (!linesRes.ok) throw new Error(`Failed to fetch lines.csv: ${linesRes.status}`);
    if (!flowsRes.ok) throw new Error(`Failed to fetch line_flows_nominal.csv: ${flowsRes.status}`);

    const linesText = await linesRes.text();
    const flowsText = await flowsRes.text();
    console.log('Fetched CSVs from GitHub');

    return parseGrid(linesText, flowsText);
  } catch (e) {
    console.error('GitHub fetch failed, falling back to local CSVs:', e);
    // Fallback to local bundled CSVs
    const linesText = await Deno.readTextFile('../_shared/data/lines.csv');
    const flowsText = await Deno.readTextFile('../_shared/data/line_flows_nominal.csv');
    console.log('Loaded CSVs from local _shared folder');
    return parseGrid(linesText, flowsText);
  }
}

function parseGrid(linesText: string, flowsText: string): Map<string, LineData> {
  const linesRows = linesText.trim().split('\n').slice(1);
  const flowsRows = flowsText.trim().split('\n').slice(1);

  const flowMap = new Map<string, number>();
  flowsRows.forEach(row => {
    const [id, p0] = row.split(',');
    flowMap.set(id.trim(), parseFloat(p0));
  });

  const gridMap = new Map<string, LineData>();
  linesRows.forEach(row => {
    const cols = row.split(',');
    const id = cols[0].trim();
    const bus0 = parseInt(cols[1]);
    const bus1 = parseInt(cols[2]);
    const name = cols[4].trim(); // branch_name
    const conductor = cols[11].trim();
    const MOT = parseFloat(cols[12]);

    let kV = 138;
    if (name.includes('69')) kV = 69;
    if (name.includes('138')) kV = 138;

    gridMap.set(id, {
      id,
      bus0,
      bus1,
      name,
      conductor,
      p0_nominal: flowMap.get(id) || 0,
      kV,
      MOT,
    });
  });

  return gridMap;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg, scenario }: ContingencyRequest = await req.json();
    
    console.log(`Contingency analysis: tempC=${tempC}, windMS=${windMS}, windDeg=${windDeg}`);

    const gridData = await loadGridData();
    const lines = Array.from(gridData.values());
    
    // Build bus-to-lines map for neighbor finding
    const busToLines = new Map<number, string[]>();
    lines.forEach(line => {
      if (!busToLines.has(line.bus0)) busToLines.set(line.bus0, []);
      if (!busToLines.has(line.bus1)) busToLines.set(line.bus1, []);
      busToLines.get(line.bus0)!.push(line.id);
      busToLines.get(line.bus1)!.push(line.id);
    });

    const contingencies: ContingencyResult[] = [];

    // For each line, simulate outage
    for (const outageLine of lines) {
      // Find neighbors (lines sharing a bus)
      const neighbors = new Set<string>();
      const bus0Neighbors = busToLines.get(outageLine.bus0) || [];
      const bus1Neighbors = busToLines.get(outageLine.bus1) || [];
      
      [...bus0Neighbors, ...bus1Neighbors].forEach(lineId => {
        if (lineId !== outageLine.id) neighbors.add(lineId);
      });

      if (neighbors.size === 0) continue;

      // Redistribute outage line's power (heuristic: 30% stress increase)
      const stressIncreaseFactor = 0.30;
      const issues: ContingencyIssue[] = [];
      let maxStress = 0;

      for (const neighborId of neighbors) {
        const neighbor = gridData.get(neighborId)!;
        
        // Calculate base rating
        const baseRating = ieee738Ampacity(
          neighbor.conductor,
          tempC,
          windMS,
          0, // Simplified azimuth
          windDeg,
          neighbor.MOT
        );

        // Calculate actual current with stress increase
        const baseActual = (neighbor.p0_nominal * 1000) / (Math.sqrt(3) * neighbor.kV);
        const increasedActual = baseActual * (1 + stressIncreaseFactor);
        
        const stress = computeLineStress(increasedActual, baseRating);
        
        if (stress > 80) {
          issues.push({
            line: neighbor.name,
            stress: Math.round(stress * 10) / 10
          });
          maxStress = Math.max(maxStress, stress);
        }
      }

      if (issues.length > 0) {
        contingencies.push({
          outage: outageLine.name,
          issues: issues.sort((a, b) => b.stress - a.stress),
          maxStress
        });
      }
    }

    // Sort by max stress and take top 10
    contingencies.sort((a, b) => b.maxStress - a.maxStress);
    const topContingencies = contingencies.slice(0, 10);

    console.log(`Found ${contingencies.length} contingencies, returning top ${topContingencies.length}`);

    return new Response(
      JSON.stringify({ contingencies: topContingencies }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Contingency analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
