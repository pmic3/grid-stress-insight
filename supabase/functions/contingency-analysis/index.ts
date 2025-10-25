import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readJsonOrDefault(req: Request) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      return {
        tempC: parseFloat(url.searchParams.get("tempC") ?? "25"),
        windMS: parseFloat(url.searchParams.get("windMS") ?? "5"),
        windDeg: parseFloat(url.searchParams.get("windDeg") ?? "90"),
        scenario: url.searchParams.get("scenario") ?? "nominal",
      };
    }
    const obj = await req.json().catch(() => ({}));
    return {
      tempC: Number.isFinite(obj?.tempC) ? obj.tempC : 25,
      windMS: Number.isFinite(obj?.windMS) ? obj.windMS : 5,
      windDeg: Number.isFinite(obj?.windDeg) ? obj.windDeg : 90,
      scenario: typeof obj?.scenario === "string" ? obj.scenario : "nominal",
    };
  } catch {
    return { tempC: 25, windMS: 5, windDeg: 90, scenario: "nominal" };
  }
}

// ---------- CSV loading (header-based, robust)
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

async function loadGridData(): Promise<Map<string, LineData>> {
  const GITHUB = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/";
  const [linesRes, flowsRes] = await Promise.all([
    fetch(`${GITHUB}csv/lines.csv`),
    fetch(`${GITHUB}line_flows_nominal.csv`),
  ]);
  if (!linesRes.ok || !flowsRes.ok) {
    throw new Error(`CSV fetch failed: lines=${linesRes.status} flows=${flowsRes.status}`);
  }
  const [linesText, flowsText] = await Promise.all([linesRes.text(), flowsRes.text()]);

  const toRows = (t: string) =>
    t
      .trim()
      .split("\n")
      .map((r) => r.split(","));
  const L = toRows(linesText);
  const F = toRows(flowsText);
  const Lh = L[0].map((h) => h.trim().toLowerCase());
  const Fh = F[0].map((h) => h.trim().toLowerCase());

  const idx = (hdr: string[], name: string) => {
    const i = hdr.indexOf(name.toLowerCase());
    if (i < 0) throw new Error(`Missing column "${name}"`);
    return i;
  };

  const Li = {
    name: idx(Lh, "name"),
    bus0: idx(Lh, "bus0"),
    bus1: idx(Lh, "bus1"),
    branch_name: idx(Lh, "branch_name"),
    conductor: idx(Lh, "conductor"),
    mot: idx(Lh, "mot"),
  };
  const Fi = {
    name: idx(Fh, "name"),
    p0_nominal: idx(Fh, "p0_nominal"),
  };

  const flowMap = new Map<string, number>();
  for (let r = 1; r < F.length; r++) {
    const row = F[r];
    const nm = (row[Fi.name] ?? "").trim();
    const p0 = parseFloat(row[Fi.p0_nominal] ?? "0");
    if (nm) flowMap.set(nm, Number.isFinite(p0) ? p0 : 0);
  }

  const grid = new Map<string, LineData>();
  for (let r = 1; r < L.length; r++) {
    const row = L[r];
    const id = (row[Li.name] ?? "").trim(); // "name" used as unique id
    if (!id) continue;

    const name = (row[Li.branch_name] ?? id).trim();
    const bus0 = parseInt(row[Li.bus0] ?? "", 10);
    const bus1 = parseInt(row[Li.bus1] ?? "", 10);
    const conductor = (row[Li.conductor] ?? "").trim();
    const MOT = parseFloat(row[Li.mot] ?? "100");

    // Quick kV heuristic from line name (e.g., "...69...", "...138...")
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

  // Diagnostics
  const any = grid.values().next().value;
  console.log("Grid size:", grid.size, "Sample:", any?.id, any?.name, any?.kV, any?.p0_nominal);
  return grid;
}

// ---------- Simplified ampacity + stress
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
  const p = conductorLibrary[conductor];
  if (!p) return 600; // safe default

  const D = p.diam_mm / 1000;
  const k_air = 0.026; // W/mK
  const Nu = 5; // rough constant for hackathon
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

// ---------- Handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg } = await readJsonOrDefault(req);

    const grid = await loadGridData();
    if (!grid.size) return jsonResponse({ error: "No grid data loaded" }, 400);

    // Build adjacency map bus -> [line ids]
    const busToLines = new Map<number, string[]>();
    for (const L of grid.values()) {
      if (!busToLines.has(L.bus0)) busToLines.set(L.bus0, []);
      if (!busToLines.has(L.bus1)) busToLines.set(L.bus1, []);
      busToLines.get(L.bus0)!.push(L.id);
      busToLines.get(L.bus1)!.push(L.id);
    }

    const contingencies: {
      outage: string;
      issues: { line: string; stress: number }[];
      maxStress: number;
    }[] = [];

    // For each line, simulate outage (heuristic redistribution to neighbors)
    for (const outage of grid.values()) {
      const neighbors = new Set<string>();
      (busToLines.get(outage.bus0) ?? []).forEach((id) => id !== outage.id && neighbors.add(id));
      (busToLines.get(outage.bus1) ?? []).forEach((id) => id !== outage.id && neighbors.add(id));
      if (!neighbors.size) continue;

      const stressIncreaseFactor = 0.3; // heuristic “extra burden” on neighbors
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
    return jsonResponse({ contingencies: contingencies.slice(0, 10) });
  } catch (err) {
    console.error("Contingency analysis error:", err);
    return jsonResponse({ error: String((err as any)?.message ?? err) }, 500);
  }
});
