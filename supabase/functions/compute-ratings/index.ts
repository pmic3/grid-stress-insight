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
  res25C: number;
  res50C: number;
  diameter: number;
  alpha: number;
  emissivity: number;
  absorptivity: number;
}

interface ConductorLibData {
  name: string;
  res25C: number;
  res50C: number;
  diameter: number;
}

interface LineData {
  id: string;
  bus0: string;
  bus1: string;
  conductor: string;
  s_nom: number;
  mot: number;
  nominalMW: number;
  geometry: any;
  azimuth: number;
  kV: number;
}

const conductorLibraryCache: Map<string, ConductorLibData> = new Map();
const busVoltageCache: Map<string, number> = new Map();

async function loadConductorLibrary(): Promise<Map<string, ConductorLibData>> {
  if (conductorLibraryCache.size > 0) return conductorLibraryCache;
  
  try {
    const csvPath = new URL('../_shared/data/conductor_library.csv', import.meta.url);
    const csvText = await Deno.readTextFile(csvPath);
    const lines = csvText.trim().split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        const name = parts[0].trim();
        const res25C = parseFloat(parts[1]);
        const res50C = parseFloat(parts[2]);
        const diameter = parseFloat(parts[3]) * 25.4; // inches to mm
        
        conductorLibraryCache.set(name, { name, res25C, res50C, diameter });
      }
    }
    
    console.log(`Loaded ${conductorLibraryCache.size} conductors from library`);
    return conductorLibraryCache;
  } catch (error) {
    console.error('Error loading conductor library:', error);
    return conductorLibraryCache;
  }
}

async function loadBusVoltages(): Promise<Map<string, number>> {
  if (busVoltageCache.size > 0) return busVoltageCache;
  
  try {
    const csvPath = new URL('../_shared/data/buses.csv', import.meta.url);
    const csvText = await Deno.readTextFile(csvPath);
    const lines = csvText.trim().split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 16) {
        const busName = parts[15].trim(); // BusName column
        const vNom = parseFloat(parts[1]); // v_nom column
        
        if (busName && !isNaN(vNom)) {
          busVoltageCache.set(busName, vNom);
        }
      }
    }
    
    console.log(`Loaded ${busVoltageCache.size} bus voltages`);
    const voltages = Array.from(busVoltageCache.values());
    console.log(`Bus voltage range: ${Math.min(...voltages)} - ${Math.max(...voltages)} kV`);
    return busVoltageCache;
  } catch (error) {
    console.error('Error loading bus voltages:', error);
    return busVoltageCache;
  }
}

function getConductorParams(conductorName: string, library: Map<string, ConductorLibData>): ConductorParams {
  const libData = library.get(conductorName);
  
  if (libData) {
    const alpha = (libData.res50C - libData.res25C) / (libData.res25C * 25);
    return {
      res25C: libData.res25C,
      res50C: libData.res50C,
      diameter: libData.diameter,
      alpha: alpha > 0 ? alpha : 0.0039,
      emissivity: 0.8,
      absorptivity: 0.8,
    };
  }
  
  console.warn(`Conductor ${conductorName} not found in library, using default`);
  return {
    res25C: 0.1166,
    res50C: 0.1278,
    diameter: 28.1,
    alpha: 0.0039,
    emissivity: 0.8,
    absorptivity: 0.8,
  };
}

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

function resistanceAtTemp(res25C: number, alpha: number, tempC: number): number {
  return res25C * (1 + alpha * (tempC - 25));
}

function ieee738Ampacity(
  ambientTempC: number,
  windMS: number,
  attackAngleDeg: number,
  motC: number,
  conductor: ConductorParams
): number {
  const Tmax = motC;
  const Ta = ambientTempC;
  const V = Math.max(windMS, 0.5);
  const phi = (attackAngleDeg * Math.PI) / 180;
  
  const D = conductor.diameter / 1000; // mm to m
  const eps = conductor.emissivity;
  const alpha_solar = conductor.absorptivity;
  const R = conductor.res25C / 1000; // ohm/km to ohm/m
  const alpha_R = conductor.alpha;
  
  const sigma = 5.67e-8;
  const nu = 1.5e-5;
  const k = 0.026;
  
  const Re = (V * D) / nu;
  const Nu = 0.24 * Math.pow(Re, 0.6);
  const h_conv = (Nu * k) / D;
  
  const Q_conv = h_conv * Math.PI * D * (Tmax - Ta) * Math.abs(Math.sin(phi));
  const Q_rad = eps * sigma * Math.PI * D * (Math.pow(Tmax + 273.15, 4) - Math.pow(Ta + 273.15, 4));
  const Q_solar = alpha_solar * 1000 * D * 0.5;
  
  const Q_net = Q_conv + Q_rad - Q_solar;
  
  const R_actual = resistanceAtTemp(R, alpha_R, Tmax);
  const I = Math.sqrt(Math.max(0, Q_net / R_actual));
  
  return I;
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

let cachedGridData: Map<string, LineData> | null = null;

async function loadGridData(): Promise<Map<string, LineData>> {
  if (cachedGridData) return cachedGridData;
  
  const [conductorLib, busVoltages] = await Promise.all([
    loadConductorLibrary(),
    loadBusVoltages()
  ]);
  
  const gridData: Map<string, LineData> = new Map();
  
  try {
    const linesCsvPath = new URL('../_shared/data/lines.csv', import.meta.url);
    const linesCsv = await Deno.readTextFile(linesCsvPath);
    const linesRows = linesCsv.trim().split('\n');
    
    const lineMap: Map<string, any> = new Map();
    for (let i = 1; i < linesRows.length; i++) {
      const parts = linesRows[i].split(',');
      if (parts.length >= 13) {
        lineMap.set(parts[0], {
          bus0: parts[1],
          bus1: parts[2],
          conductor: parts[11],
          s_nom: parseFloat(parts[10]),
          mot: parseFloat(parts[12]),
        });
      }
    }
    
    const flowsCsvPath = new URL('../_shared/data/line_flows_nominal.csv', import.meta.url);
    const flowsCsv = await Deno.readTextFile(flowsCsvPath);
    const flowsRows = flowsCsv.trim().split('\n');
    
    const flowMap: Map<string, number> = new Map();
    for (let i = 1; i < flowsRows.length; i++) {
      const parts = flowsRows[i].split(',');
      if (parts.length >= 2) {
        flowMap.set(parts[0], parseFloat(parts[1]));
      }
    }
    
    const geojsonPath = new URL('../_shared/data/oneline_lines.geojson', import.meta.url);
    const geojsonText = await Deno.readTextFile(geojsonPath);
    const geojson = JSON.parse(geojsonText);
    
    for (const feature of geojson.features) {
      const id = feature.properties.Name;
      const lineData = lineMap.get(id);
      
      if (lineData) {
        const bus0Voltage = busVoltages.get(lineData.bus0) || 69;
        const bus1Voltage = busVoltages.get(lineData.bus1) || 69;
        const kV = Math.max(bus0Voltage, bus1Voltage);
        
        const coords = getLineCoords(feature.geometry);
        const azimuth = coords ? computeAzimuthFromCoords(coords) : 0;
        
        gridData.set(id, {
          id,
          bus0: lineData.bus0,
          bus1: lineData.bus1,
          conductor: lineData.conductor,
          s_nom: lineData.s_nom,
          mot: lineData.mot,
          nominalMW: flowMap.get(id) || 0,
          geometry: feature.geometry,
          azimuth,
          kV,
        });
      }
    }
    
    console.log(`Loaded ${gridData.size} lines with bus voltages`);
    cachedGridData = gridData;
    return gridData;
  } catch (error) {
    console.error('Error loading grid data:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg, scenario }: ComputeRatingsRequest = await req.json();
    
    const gridData = await loadGridData();
    const conductorLib = await loadConductorLibrary();
    
    const scenarioMultiplier = scenario === 'min' ? 0.85 : scenario === 'max' ? 1.15 : 1.0;
    
    const lineResults: any[] = [];
    const stresses: number[] = [];
    
    for (const [lineId, lineData] of gridData.entries()) {
      const actualMW = lineData.nominalMW * scenarioMultiplier;
      const actualA = (actualMW * 1000) / (Math.sqrt(3) * lineData.kV);
      
      const conductor = getConductorParams(lineData.conductor, conductorLib);
      const attackAngle = computeAttackAngle(windDeg, lineData.azimuth);
      const dynamicA = ieee738Ampacity(tempC, windMS, attackAngle, lineData.mot, conductor);
      
      const nameplateA = (lineData.s_nom * 1000) / (Math.sqrt(3) * lineData.kV);
      const deltaPct = ((dynamicA - nameplateA) / nameplateA) * 100;
      
      const stress = computeLineStress(actualA, dynamicA);
      stresses.push(stress);
      
      lineResults.push({
        id: lineId,
        kV: lineData.kV.toFixed(1),
        conductor: lineData.conductor,
        actualA: actualA.toFixed(1),
        dynamicRatingA: dynamicA.toFixed(1),
        nameplateA: nameplateA.toFixed(1),
        deltaPct: deltaPct.toFixed(1),
        stressPct: stress.toFixed(1),
        mot: lineData.mot,
      });
    }
    
    const systemStats = computeSystemStressIndex(stresses);
    
    const sortedLines = lineResults
      .map((l, i) => ({ ...l, stress: stresses[i] }))
      .sort((a, b) => b.stress - a.stress)
      .slice(0, 5);
    
    return new Response(JSON.stringify({
      lines: lineResults,
      system: {
        ssi: systemStats.ssi.toFixed(1),
        bands: systemStats.bands,
        avgStress: systemStats.avgStress.toFixed(1),
        maxStress: systemStats.maxStress.toFixed(1),
        topLinesAtRisk: sortedLines.map(l => ({
          id: l.id,
          stressPct: l.stressPct,
          overloadTemp: 'N/A',
        })),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in compute-ratings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
