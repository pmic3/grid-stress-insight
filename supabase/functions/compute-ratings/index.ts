import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ComputeRatingsRequest {
  tempC: number;
  windMS: number;
  windDeg: number;
  scenario: "min" | "nominal" | "max";
}

interface ConductorParams {
  diameter: number; // mm
  resistance: number; // ohms/km at 25C
  emissivity: number;
  absorptivity: number;
}

// Simplified conductor library
const conductorLibrary: Record<string, ConductorParams> = {
  "ACSR 795": {
    diameter: 28.1,
    resistance: 0.0733,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
  "ACSR 1033": {
    diameter: 31.8,
    resistance: 0.0563,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
  "ACSR 477": {
    diameter: 21.8,
    resistance: 0.1206,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
};

function normalizeKV(raw: any): number {
  const v = parseFloat(raw);
  if (!isFinite(v) || v <= 0) return 115;
  if (v > 1000) return v / 1000; // Volts → kV (e.g., 69000 → 69)
  if (v < 1) return v * 1000; // MV → kV (e.g., 0.115 → 115)
  return v; // already kV
}

function getLineCoords(geom: any): number[][] | null {
  if (!geom) return null;
  if (geom.type === "LineString") return geom.coordinates as number[][];
  if (geom.type === "MultiLineString" && geom.coordinates?.length > 0) return geom.coordinates[0] as number[][];
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
  return (brng + 360) % 360; // 0..360
}

// IEEE-738 simplified calculations
function computeAttackAngle(windDeg: number, lineAzimuthDeg: number): number {
  // normalize to [0, 360)
  const a = ((windDeg % 360) + 360) % 360;
  const b = ((lineAzimuthDeg % 360) + 360) % 360;
  // smallest absolute difference
  let delta = Math.abs(a - b);
  if (delta > 180) delta = 360 - delta;
  // attack angle for convection is 0..90
  return Math.min(delta, 90);
}

function resistanceAtTemp(R25: number, alpha: number, Tc_C: number): number {
  return R25 * (1 + alpha * (Tc_C - 25));
}

function ieee738Ampacity(
  tempC: number,
  windMS: number,
  attackDeg: number,
  motC: number,
  conductor: ConductorParams,
): number {
  const airDensity = 1.225; // kg/m³
  const windAngleFactor = Math.sin((Math.max(0, Math.min(90, attackDeg)) * Math.PI) / 180);
  const effectiveWind = Math.max(0.2, windMS * Math.max(0.2, windAngleFactor));

  const diameterM = conductor.diameter / 1000;
  // Convection (very simplified scaling; OK for hackathon)
  const convectionCooling =
    0.0119 * airDensity ** 0.6 * effectiveWind ** 0.6 * diameterM ** 0.4 * Math.max(0, motC - tempC);

  // Radiation
  const sigma = 5.67e-8;
  const Tk = motC + 273.15;
  const Ta = tempC + 273.15;
  const radiationCooling = sigma * conductor.emissivity * Math.PI * diameterM * (Tk ** 4 - Ta ** 4);

  const totalCoolingPerMeter = convectionCooling + radiationCooling;
  const totalCoolingPerKm = totalCoolingPerMeter * 1000;

  const Rkm = resistanceAtTemp(conductor.resistance, 0.0039, motC); // α≈0.0039
  const I2 = totalCoolingPerKm / Math.max(Rkm, 1e-9);
  return Math.sqrt(Math.max(I2, 0));
}

function computeLineStress(actualA: number, ratingA: number): number {
  return (actualA / ratingA) * 100;
}

function solveOverloadTemp(
  line: any,
  windMS: number,
  windDeg: number,
  actualA: number,
  conductor: ConductorParams,
): number | null {
  const attack = line.attackAngle;

  // If already overloaded at cool ambient
  const ratingAt0 = ieee738Ampacity(0, windMS, attack, line.mot, conductor);
  if (ratingAt0 < actualA) return 0;

  // If still safe at very hot ambient, report no overload in range
  const ratingAt60 = ieee738Ampacity(60, windMS, attack, line.mot, conductor);
  if (ratingAt60 >= actualA) return null;

  // Binary search 0..60 °C
  let lo = 0,
    hi = 60;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const r = ieee738Ampacity(mid, windMS, attack, line.mot, conductor);
    if (r < actualA) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function computeSystemStressIndex(stresses: number[]): any {
  const low = stresses.filter((s) => s < 70).length;
  const medium = stresses.filter((s) => s >= 70 && s < 90).length;
  const high = stresses.filter((s) => s >= 90 && s < 100).length;
  const overload = stresses.filter((s) => s >= 100).length;

  const total = stresses.length;
  const avgStress = stresses.reduce((a, b) => a + b, 0) / total;
  const maxStress = Math.max(...stresses);

  // System stress index: weighted average favoring high stress
  const ssi = (low * 0.1 + medium * 0.4 + high * 0.7 + overload * 1.0) / total;

  return {
    ssi,
    bands: { low, medium, high, overload },
    avgStress,
    maxStress,
  };
}

// In-memory cache for grid data
let cachedGridData: any = null;

async function loadGridData() {
  if (cachedGridData) return cachedGridData;

  const GITHUB_BASE = "https://raw.githubusercontent.com/cwebber314/osu_hackathon/main/hawaii40_osu/";

  const [linesRes, flowsRes, geojsonRes] = await Promise.all([
    fetch(`${GITHUB_BASE}csv/lines.csv`),
    fetch(`${GITHUB_BASE}line_flows_nominal.csv`),
    fetch(`${GITHUB_BASE}gis/oneline_lines.geojson`),
  ]);

  if (!linesRes.ok || !flowsRes.ok || !geojsonRes.ok) {
    throw new Error("Failed to fetch grid data files");
  }

  const [linesCsv, flowsCsv, geojsonText] = await Promise.all([linesRes.text(), flowsRes.text(), geojsonRes.text()]);

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
      const values = line.split(",");
      const obj: any = {};
      headers.forEach((header, i) => {
        obj[header] = values[i];
      });
      return obj;
    });
  };

  const linesData = parseCSV(linesCsv);
  const flowsData = parseCSV(flowsCsv);
  const geojson = JSON.parse(geojsonText);

  const flowsMap: Record<string, any> = {};
  flowsData.forEach((flow) => {
    flowsMap[flow.name] = parseFloat(flow.p0_nominal);
  });

  const linesDict: Record<string, any> = {};
  geojson.features.forEach((feature: any) => {
    const lineId = feature?.properties?.Name || feature?.properties?.id;
    if (!lineId) return;

    const lineData = linesData.find((l: any) => l.name === lineId);
    if (!lineData || !feature.geometry) return;

    const coords = getLineCoords(feature.geometry);
    const azimuth = coords ? computeAzimuthFromCoords(coords) : 0;

    const kV = feature.properties.kV ? normalizeKV(feature.properties.kV) : normalizeKV(feature.properties.nomkv);

    linesDict[lineId] = {
      id: lineId,
      name: lineData.branch_name || lineId,
      azimuth,
      kV,
      conductor: lineData.conductor,
      mot: parseFloat(lineData.MOT) || 100,
      s_nom: parseFloat(lineData.s_nom),
      p0_nominal: parseFloat(flowsMap[lineId]) || 0, // MW (pf≈1)
    };
  });

  cachedGridData = linesDict;
  console.log(`Loaded ${Object.keys(linesDict).length} lines`);
  const sample = Object.values(linesDict).slice(0, 3);
  console.log(
    "Sample:",
    sample.map((l) => ({ id: l.id, kV: l.kV, MW: l.p0_nominal, conductor: l.conductor })),
  );
  return cachedGridData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg, scenario }: ComputeRatingsRequest = await req.json();

    console.log("Computing ratings:", { tempC, windMS, windDeg, scenario });

    const linesDict = await loadGridData();
    const lineIds = Object.keys(linesDict);

    console.log(`Processing ${lineIds.length} lines`);

    const scenarioMultiplier = { min: 0.85, nominal: 1.0, max: 1.15 };

    const results = lineIds.map((lineId) => {
      const line = linesDict[lineId];
      const conductor = conductorLibrary[line.conductor] || conductorLibrary["ACSR 795"];
      const attackAngle = computeAttackAngle(windDeg, line.azimuth);

      // Convert MW → Amps (approx. assuming pf ≈ 1)
      const actualMW = Math.abs(line.p0_nominal) * scenarioMultiplier[scenario];
      const actualA = (actualMW * 1000) / (Math.sqrt(3) * line.kV);

      const ratingA = ieee738Ampacity(tempC, windMS, attackAngle, line.mot, conductor);
      const stressPct = computeLineStress(actualA, ratingA);
      const overloadTemp = solveOverloadTemp({ ...line, attackAngle }, windMS, windDeg, actualA, conductor);

      return {
        id: lineId,
        name: line.name,
        ratingA,
        actualA,
        stressPct,
        overloadTemp,
      };
    });

    const stresses = results.map((r) => r.stressPct);
    const systemStats = computeSystemStressIndex(stresses);

    // Debug: log a few sample lines to verify units
    try {
      const sample = results
        .slice(0, 3)
        .map((r) => ({ id: r.id, ratingA: r.ratingA, actualA: r.actualA, stressPct: r.stressPct }));
      console.log("Sample ratings:", JSON.stringify(sample));
    } catch (_) {}

    const response = {
      lines: results,
      system: systemStats,
      conditions: { tempC, windMS, windDeg, scenario },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error computing ratings:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
