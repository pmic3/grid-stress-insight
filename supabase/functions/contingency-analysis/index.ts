import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  "795 ACSR 26/7 DRAKE": { diam_mm: 28.14, r25_ohm_km: 0.0724, alpha: 0.00404 },
  "556.5 ACSR 26/7 DOVE": { diam_mm: 23.01, r25_ohm_km: 0.1039, alpha: 0.00404 },
  "1272 ACSR 45/7 BITTERN": { diam_mm: 35.1, r25_ohm_km: 0.04559, alpha: 0.00404 },
  "336.4 ACSR 30/7 ORIOLE": { diam_mm: 17.9, r25_ohm_km: 0.1723, alpha: 0.00404 },
};

function ieee738Ampacity(
  conductor: string,
  tempC: number,
  windMS: number,
  azimuthDeg: number,
  windDeg: number,
  MOT: number,
): number {
  const params = conductorLibrary[conductor];
  if (!params) return 600; // safe default

  const D = params.diam_mm / 1000;
  const TavgK = (tempC + MOT) / 2 + 273.15;

  // Air props (rough)
  const mu = 1.846e-5; // Pa·s (approx at 300K)
  const Re = Math.max(1, (windMS * D) / mu);
  const k_air = 0.026; // W/mK
  const Nu = 0.3 + 0.62 * Math.sqrt(Re) * Math.pow(1, 1 / 3); // Pr≈0.71 -> ~1
  const h_conv = (Nu * k_air) / D;

  const attack = Math.abs(((azimuthDeg - windDeg + 540) % 360) - 180); // 0..180
  const windFactor = 0.5 + 0.5 * Math.cos((Math.min(attack, 90) * Math.PI) / 180);
  const qc = Math.max(0, h_conv * windFactor * Math.max(0, MOT - tempC)); // W/m

  const eps = 0.8,
    sigma = 5.67e-8;
  const qr = Math.max(0, eps * sigma * (Math.pow(MOT + 273.15, 4) - Math.pow(tempC + 273.15, 4))); // W/m

  const qs = 0; // no solar
  const Rkm = params.r25_ohm_km * (1 + (params.alpha ?? 0.0039) * (MOT - 25));
  const Rm = Math.max(Rkm / 1000, 1e-8); // Ω/m

  const num = Math.max(qc + qr - qs, 0); // W/m
  const I = Math.sqrt(num / Rm);
  return isFinite(I) ? Math.max(I, 100) : 600;
}

function computeLineStress(actualA: number, ratingA: number): number {
  return ratingA > 0 ? (actualA / ratingA) * 100 : 0;
}

async function loadGridData(): Promise<Map<string, LineData>> {
  const GITHUB = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/";
  const [linesText, flowsText] = await Promise.all([
    fetch(`${GITHUB}csv/lines.csv`).then((r) => r.text()),
    fetch(`${GITHUB}line_flows_nominal.csv`).then((r) => r.text()),
  ]);
  return parseGrid(linesText, flowsText);
}

function parseGrid(linesText: string, flowsText: string): Map<string, LineData> {
  const toRows = (t: string) =>
    t
      .trim()
      .split("\n")
      .map((r) => r.split(","));
  const linesRows = toRows(linesText);
  const flowsRows = toRows(flowsText);

  // Headers
  const Lh = linesRows[0];
  const Fh = flowsRows[0];

  // Header indices (by name, safer than magic numbers)
  const idx = (hdr: string[], name: string) => {
    const i = hdr.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`Missing column "${name}"`);
    return i;
  };

  const Li = {
    name: idx(Lh, "name"),
    bus0: idx(Lh, "bus0"),
    bus1: idx(Lh, "bus1"),
    branch_name: idx(Lh, "branch_name"),
    conductor: idx(Lh, "conductor"),
    MOT: idx(Lh, "MOT"),
  };

  const Fi = {
    name: idx(Fh, "name"),
    p0_nominal: idx(Fh, "p0_nominal"),
  };

  // Flow map by line "name"
  const flowMap = new Map<string, number>();
  for (let r = 1; r < flowsRows.length; r++) {
    const row = flowsRows[r];
    const nm = (row[Fi.name] ?? "").trim();
    const p0 = parseFloat(row[Fi.p0_nominal]);
    if (nm) flowMap.set(nm, isFinite(p0) ? p0 : 0);
  }

  // Build grid
  const grid = new Map<string, LineData>();
  for (let r = 1; r < linesRows.length; r++) {
    const row = linesRows[r];
    const id = (row[Li.name] ?? "").trim(); // "name" is the unique id used across files
    const name = (row[Li.branch_name] ?? id).trim();
    const bus0 = parseInt(row[Li.bus0] ?? "", 10);
    const bus1 = parseInt(row[Li.bus1] ?? "", 10);
    const conductor = (row[Li.conductor] ?? "").trim();
    const MOT = parseFloat(row[Li.MOT] ?? "100");

    // quick, safe kV heuristic from text
    let kV = 115;
    if (/\b69\b/.test(name)) kV = 69;
    else if (/\b138\b/.test(name)) kV = 138;

    if (!id) continue;

    grid.set(id, {
      id,
      bus0: isFinite(bus0) ? bus0 : -1,
      bus1: isFinite(bus1) ? bus1 : -1,
      name,
      conductor,
      p0_nominal: flowMap.get(id) ?? 0, // MW (pf≈1)
      kV,
      MOT: isFinite(MOT) ? MOT : 100,
    });
  }

  return grid;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg, scenario }: ContingencyRequest = await req.json();

    console.log(`Contingency analysis: tempC=${tempC}, windMS=${windMS}, windDeg=${windDeg}`);

    const gridData = await loadGridData();
    const lines = Array.from(gridData.values());

    // Build bus-to-lines map for neighbor finding
    const busToLines = new Map<number, string[]>();
    lines.forEach((line) => {
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

      [...bus0Neighbors, ...bus1Neighbors].forEach((lineId) => {
        if (lineId !== outageLine.id) neighbors.add(lineId);
      });

      if (neighbors.size === 0) continue;

      // Redistribute outage line's power (heuristic: 30% stress increase)
      const stressIncreaseFactor = 0.3;
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
          neighbor.MOT,
        );

        // Calculate actual current with stress increase
        const baseActual = (neighbor.p0_nominal * 1000) / (Math.sqrt(3) * neighbor.kV);
        const increasedActual = baseActual * (1 + stressIncreaseFactor);

        const stress = computeLineStress(increasedActual, baseRating);

        if (stress > 80) {
          issues.push({
            line: neighbor.name,
            stress: Math.round(stress * 10) / 10,
          });
          maxStress = Math.max(maxStress, stress);
        }
      }

      if (issues.length > 0) {
        contingencies.push({
          outage: outageLine.name,
          issues: issues.sort((a, b) => b.stress - a.stress),
          maxStress,
        });
      }
    }

    // Sort by max stress and take top 10
    contingencies.sort((a, b) => b.maxStress - a.maxStress);
    const topContingencies = contingencies.slice(0, 10);

    console.log(`Found ${contingencies.length} contingencies, returning top ${topContingencies.length}`);

    return new Response(JSON.stringify({ contingencies: topContingencies }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Contingency analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
