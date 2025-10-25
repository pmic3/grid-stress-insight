import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const conductorLibraryCache: Map<string, ConductorLibData> = new Map();
const busVoltageCache: Map<string, number> = new Map();

async function loadConductorLibrary(): Promise<Map<string, ConductorLibData>> {
  if (conductorLibraryCache.size > 0) return conductorLibraryCache;
  
  const csvPath = new URL('../_shared/data/conductor_library.csv', import.meta.url);
  const csvText = await Deno.readTextFile(csvPath);
  const lines = csvText.trim().split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 4) {
      const name = parts[0].trim();
      const res25C = parseFloat(parts[1]);
      const res50C = parseFloat(parts[2]);
      const diameter = parseFloat(parts[3]) * 25.4;
      
      conductorLibraryCache.set(name, { name, res25C, res50C, diameter });
    }
  }
  
  return conductorLibraryCache;
}

async function loadBusVoltages(): Promise<Map<string, number>> {
  if (busVoltageCache.size > 0) return busVoltageCache;
  
  const csvPath = new URL('../_shared/data/buses.csv', import.meta.url);
  const csvText = await Deno.readTextFile(csvPath);
  const lines = csvText.trim().split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 2) {
      const busName = parts[15]?.trim() || parts[0].trim();
      const vNom = parseFloat(parts[1]);
      
      if (busName && !isNaN(vNom)) {
        busVoltageCache.set(busName, vNom);
      }
    }
  }
  
  return busVoltageCache;
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
  
  return {
    res25C: 0.1166,
    res50C: 0.1278,
    diameter: 28.1,
    alpha: 0.0039,
    emissivity: 0.8,
    absorptivity: 0.8,
  };
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
  
  const D = conductor.diameter / 1000;
  const eps = conductor.emissivity;
  const alpha_solar = conductor.absorptivity;
  const R = conductor.res25C / 1000;
  const alpha_R = conductor.alpha;
  
  const sigma = 5.67e-8;
  const T_film = (Tmax + Ta) / 2 + 273.15;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running validation sweep...');
    
    const [conductorLib, busVoltages] = await Promise.all([
      loadConductorLibrary(),
      loadBusVoltages()
    ]);
    
    // Load lines
    const linesCsvPath = new URL('../_shared/data/lines.csv', import.meta.url);
    const linesCsv = await Deno.readTextFile(linesCsvPath);
    const linesRows = linesCsv.trim().split('\n');
    
    const allLines: any[] = [];
    for (let i = 1; i < linesRows.length; i++) {
      const parts = linesRows[i].split(',');
      if (parts.length >= 8) {
        allLines.push({
          id: parts[0],
          bus0: parts[1],
          bus1: parts[2],
          conductor: parts[11],
          s_nom: parseFloat(parts[10]),
          mot: parseFloat(parts[12]),
        });
      }
    }
    
    // Pick 5 random lines
    const randomLines = allLines
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
    
    const temperature = 25;
    const windSpeed = 2;
    const attackAngle = 90;
    
    const results: any[] = [];
    const deltas: number[] = [];
    
    for (const line of randomLines) {
      const bus0Voltage = busVoltages.get(line.bus0) || 69;
      const bus1Voltage = busVoltages.get(line.bus1) || 69;
      const kV = Math.max(bus0Voltage, bus1Voltage);
      
      const conductor = getConductorParams(line.conductor, conductorLib);
      const dynamicA = ieee738Ampacity(temperature, windSpeed, attackAngle, line.mot, conductor);
      const nameplateA = (line.s_nom * 1000) / (Math.sqrt(3) * kV);
      const deltaPct = ((dynamicA - nameplateA) / nameplateA) * 100;
      
      results.push({
        id: line.id,
        kV: kV.toFixed(1),
        s_nom: line.s_nom,
        nameplateA: nameplateA.toFixed(1),
        dynamicA: dynamicA.toFixed(1),
        deltaPct: deltaPct.toFixed(1),
      });
      
      deltas.push(Math.abs(deltaPct));
    }
    
    const meanAbsDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const maxAbsDelta = Math.max(...deltas);
    
    return new Response(JSON.stringify({
      conditions: {
        temperature,
        windSpeed,
        attackAngle,
      },
      lines: results,
      summary: {
        meanAbsDelta: meanAbsDelta.toFixed(1),
        maxAbsDelta: maxAbsDelta.toFixed(1),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in validate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
