import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parse } from "https://deno.land/std@0.224.0/csv/parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type LineRow = {
  name: string;
  bus0: string;
  bus1: string;
  branch_name: string;
  conductor: string;
  MOT: string;
};

type FlowRow = {
  name: string;
  p0_nominal: string;
};

type LineData = {
  id: string;
  name: string;
  bus0: number;
  bus1: number;
  conductor: string;
  p0_nominal: number; // MW (pf≈1)
  kV: number;
  MOT: number;
};

const conductorLibrary: Record<string, { diam_mm: number; r25_ohm_km: number; alpha?: number }> = {
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
  const p = conductorLibrary[conductor];
  if (!p) return 600; // safe default for unknowns
  const D = p.diam_mm / 1000;
  const k_air = 0.026; // W/mK
  const Nu = 5; // simple constant Nusselt for hackathon
  const h_conv = (Nu * k_air) / D;

  const attack = Math.abs(((azimuthDeg - windDeg + 540) % 360) - 180);
  const windFactor = 0.5 + 0.5 * Math.cos((Math.min(attack, 90) * Math.PI) / 180);
  const qc = Math.max(0, h_conv * windFactor * Math.max(0, MOT - tempC)); // W/m

  const eps = 0.8,
    sigma = 5.67e-8;
  const qr = Math.max(0, eps * sigma * ((MOT + 273.15) ** 4 - (tempC + 273.15) ** 4)); // W/m

  const Rkm = p.r25_ohm_km * (1 + (p.alpha ?? 0.0039) * (MOT - 25));
  const Rm = Math.max(Rkm / 1000, 1e-8); // Ω/m

  const I = Math.sqrt(Math.max(qc + qr, 0) / Rm);
  return Number.isFinite(I) ? Math.max(I, 100) : 600;
}

function computeLineStress(actualA: number, ratingA: number): number {
  return ratingA > 0 ? (actualA / ratingA) * 100 : 0;
}

async function loadGridData(debug = false) {
  const GITHUB = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/";
  const [linesRes, flowsRes] = await Promise.all([
    fetch(`${GITHUB}csv/lines.csv`),
    fetch(`${GITHUB}line_flows_nominal.csv`),
  ]);
  if (!linesRes.ok || !flowsRes.ok) {
    throw new Error(`CSV fetch failed: lines=${linesRes.status} flows=${flowsRes.status}`);
  }

  const [linesText, flowsText] = await Promise.all([linesRes.text(), flowsRes.text()]);

  // Robust CSV parse (handles quotes/commas)
  const linesRows = (await parse(linesText, { skipFirstRow: true })) as LineRow[];
  const flowsRows = (await parse(flowsText, { skipFirstRow: true })) as FlowRow[];

  // Validate headers exist (defensive)
  const needL = ["name", "bus0", "bus1", "branch_name", "conductor", "MOT"];
  const needF = ["name", "p0_nominal"];
  const linesHeaders = Object.keys(linesRows[0] ?? {});
  const flowsHeaders = Object.keys(flowsRows[0] ?? {});
  for (const h of needL)
    if (!linesHeaders.includes(h)) throw new Error(`lines.csv missing column "${h}" (have: ${linesHeaders.join(",")})`);
  for (const h of needF)
    if (!flowsHeaders.includes(h))
      throw new Error(`line_flows_nominal.csv missing column "${h}" (have: ${flowsHeaders.join(",")})`);

  // Build flow map by line "name"
  const flowMap = new Map<string, number>();
  for (const fr of flowsRows) {
    const nm = (fr.name ?? "").trim();
    const p0 = parseFloat(fr.p0_nominal ?? "0");
    if (nm) flowMap.set(nm, Number.isFinite(p0) ? p0 : 0);
  }

  // Build grid
  const grid = new Map<string, LineData>();
  for (const lr of linesRows) {
    const id = (lr.name ?? "").trim(); // unique id used in flows too
    if (!id) continue;

    const name = (lr.branch_name ?? id).trim();
    const bus0 = parseInt(lr.bus0 ?? "", 10);
    const bus1 = parseInt(lr.bus1 ?? "", 10);
    const conductor = (lr.conductor ?? "").trim();
    const MOT = parseFloat(lr.MOT ?? "100");

    // Heuristic kV from name text (quick & works for this dataset)
    let kV = 115;
    if (/\b69\b/.test(name)) kV = 69;
    else if (/\b138\b/.test(name)) kV = 138;

    grid.set(id, {
      id,
      name,
      bus0: Number.isFinite(bus0) ? bus0 : -1,
      bus1: Number.isFinite(bus1) ? bus1 : -1,
      conductor,
      p0_nominal: flowMap.get(id) ?? 0, // MW (pf≈1)
      kV,
      MOT: Number.isFinite(MOT) ? MOT : 100,
    });
  }

  if (debug) {
    console.log("lines headers:", linesHeaders);
    console.log("flows headers:", flowsHeaders);
    const any = grid.values().next().value;
    console.log("Grid size:", grid.size, "Sample:", any);
  }

  return grid;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  try {
    // Read params (GET for quick tests or POST from app)
    let tempC = 25,
      windMS = 5,
      windDeg = 90;
    if (req.method === "GET") {
      tempC = parseFloat(url.searchParams.get("tempC") ?? "25");
      windMS = parseFloat(url.searchParams.get("windMS") ?? "5");
      windDeg = parseFloat(url.searchParams.get("windDeg") ?? "90");
    } else {
      const body = await req.json().catch(() => ({}));
      tempC = Number.isFinite(body?.tempC) ? body.tempC : 25;
      windMS = Number.isFinite(body?.windMS) ? body.windMS : 5;
      windDeg = Number.isFinite(body?.windDeg) ? body.windDeg : 90;
    }

    const grid = await loadGridData(debug);
    if (!grid.size) return json({ error: "No grid data loaded" }, 500);

    // Build adjacency: bus -> [line ids]
    const busToLines = new Map<number, string[]>();
    for (const L of grid.values()) {
      if (!busToLines.has(L.bus0)) busToLines.set(L.bus0, []);
      if (!busToLines.has(L.bus1)) busToLines.set(L.bus1, []);
      busToLines.get(L.bus0)!.push(L.id);
      busToLines.get(L.bus1)!.push(L.id);
    }

    // Run N-1 (heuristic redistribution to neighbors)
    const contingencies: { outage: string; issues: { line: string; stress: number }[]; maxStress: number }[] = [];

    for (const outage of grid.values()) {
      const neighbors = new Set<string>();
      (busToLines.get(outage.bus0) ?? []).forEach((id) => id !== outage.id && neighbors.add(id));
      (busToLines.get(outage.bus1) ?? []).forEach((id) => id !== outage.id && neighbors.add(id));
      if (!neighbors.size) continue;

      const stressIncreaseFactor = 0.3;
      const issues: { line: string; stress: number }[] = [];
      let maxStress = 0;

      for (const nid of neighbors) {
        const N = grid.get(nid);
        if (!N) continue;

        const ratingA = ieee738Ampacity(N.conductor, tempC, windMS, 0, windDeg, N.MOT);
        const baseA = (Math.abs(N.p0_nominal) * 1000) / (Math.sqrt(3) * N.kV); // MW→A @ pf≈1
        const incA = baseA * (1 + stressIncreaseFactor);
        const stress = computeLineStress(incA, ratingA);

        if (stress > 80) {
          issues.push({ line: N.name, stress: Math.round(stress * 10) / 10 });
          if (stress > maxStress) maxStress = stress;
        }
      }

      if (issues.length) {
        contingencies.push({
          outage: outage.name,
          issues: issues.sort((a, b) => b.stress - a.stress),
          maxStress,
        });
      }
    }

    contingencies.sort((a, b) => b.maxStress - a.maxStress);
    return json({ contingencies: contingencies.slice(0, 10) });
  } catch (err: any) {
    // Return useful debug info instead of a blank 500
    if (debug) {
      return json({ error: String(err?.message ?? err), stack: err?.stack ?? null }, 500);
    }
    console.error("Contingency analysis error:", err);
    return json({ error: "Internal error running contingency analysis" }, 500);
  }
});
