import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComputeRatingsRequest {
  tempC: number;
  windMS: number;
  windDeg: number;
  scenario: 'min' | 'nominal' | 'max';
}

interface ConductorParams {
  diameter: number; // mm
  resistance: number; // ohms/km at 25C
  emissivity: number;
  absorptivity: number;
}

// Simplified conductor library
const conductorLibrary: Record<string, ConductorParams> = {
  'ACSR 795': {
    diameter: 28.1,
    resistance: 0.0733,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
  'ACSR 1033': {
    diameter: 31.8,
    resistance: 0.0563,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
  'ACSR 477': {
    diameter: 21.8,
    resistance: 0.1206,
    emissivity: 0.5,
    absorptivity: 0.5,
  },
};

// IEEE-738 simplified calculations
function computeAttackAngle(windDeg: number, lineAzimuthDeg: number): number {
  const diff = Math.abs(windDeg - lineAzimuthDeg);
  return Math.min(diff, 180 - diff);
}

function ieee738Ampacity(
  tempC: number,
  windMS: number,
  attackDeg: number,
  motC: number,
  conductor: ConductorParams
): number {
  // Simplified IEEE-738 steady-state rating calculation
  const airDensity = 1.225; // kg/m³
  const windAngleFactor = Math.sin(attackDeg * Math.PI / 180);
  const effectiveWind = windMS * (windAngleFactor > 0.2 ? windAngleFactor : 0.2);
  
  // Convection cooling (simplified)
  const diameterM = conductor.diameter / 1000;
  const convectionCooling = 0.0119 * airDensity ** 0.6 * effectiveWind ** 0.6 * diameterM ** 0.4 * (motC - tempC);
  
  // Radiation cooling (simplified)
  const stefanBoltzmann = 5.67e-8;
  const tempKelvin = tempC + 273.15;
  const motKelvin = motC + 273.15;
  const radiationCooling = stefanBoltzmann * conductor.emissivity * Math.PI * diameterM * 
    ((motKelvin ** 4) - (tempKelvin ** 4));
  
  // Total cooling
  const totalCooling = convectionCooling + radiationCooling;
  
  // Current rating (I²R heating = cooling)
  const currentSquared = totalCooling / conductor.resistance;
  return Math.sqrt(Math.max(0, currentSquared));
}

function computeLineStress(actualA: number, ratingA: number): number {
  return (actualA / ratingA) * 100;
}

function solveOverloadTemp(
  line: any,
  windMS: number,
  windDeg: number,
  actualA: number,
  conductor: ConductorParams
): number {
  // Binary search for temperature that causes overload
  let lowTemp = 0;
  let highTemp = line.mot;
  
  for (let i = 0; i < 20; i++) {
    const midTemp = (lowTemp + highTemp) / 2;
    const rating = ieee738Ampacity(midTemp, windMS, line.attackAngle, line.mot, conductor);
    
    if (rating < actualA) {
      highTemp = midTemp;
    } else {
      lowTemp = midTemp;
    }
  }
  
  return (lowTemp + highTemp) / 2;
}

function computeSystemStressIndex(stresses: number[]): any {
  const low = stresses.filter(s => s < 70).length;
  const medium = stresses.filter(s => s >= 70 && s < 90).length;
  const high = stresses.filter(s => s >= 90 && s < 100).length;
  const overload = stresses.filter(s => s >= 100).length;
  
  const total = stresses.length;
  const avgStress = stresses.reduce((a, b) => a + b, 0) / total;
  const maxStress = Math.max(...stresses);
  
  // System stress index: weighted average favoring high stress
  const ssi = (
    low * 0.1 +
    medium * 0.4 +
    high * 0.7 +
    overload * 1.0
  ) / total;
  
  return {
    ssi,
    bands: { low, medium, high, overload },
    avgStress,
    maxStress,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tempC, windMS, windDeg, scenario }: ComputeRatingsRequest = await req.json();
    
    console.log('Computing ratings:', { tempC, windMS, windDeg, scenario });

    // Mock line data (in production, load from CSV/GeoJSON)
    const lines = [
      { id: 'L1', name: 'Line 1-2', conductor: 'ACSR 795', mot: 75, azimuth: 45, nominalMVA: 150, kV: 115, scenario: { min: 0.85, nominal: 1.0, max: 1.15 } },
      { id: 'L2', name: 'Line 2-3', conductor: 'ACSR 795', mot: 75, azimuth: 90, nominalMVA: 120, kV: 115, scenario: { min: 0.85, nominal: 1.0, max: 1.15 } },
      { id: 'L3', name: 'Line 3-4', conductor: 'ACSR 1033', mot: 75, azimuth: 135, nominalMVA: 200, kV: 115, scenario: { min: 0.85, nominal: 1.0, max: 1.15 } },
      { id: 'L4', name: 'Line 4-5', conductor: 'ACSR 477', mot: 75, azimuth: 180, nominalMVA: 100, kV: 115, scenario: { min: 0.85, nominal: 1.0, max: 1.15 } },
    ];

    const results = lines.map(line => {
      const conductor = conductorLibrary[line.conductor];
      const attackAngle = computeAttackAngle(windDeg, line.azimuth);
      
      // Convert MVA to Amps: MVA * 1000 / (sqrt(3) * kV)
      const actualMVA = line.nominalMVA * line.scenario[scenario];
      const actualA = (actualMVA * 1000) / (Math.sqrt(3) * line.kV);
      
      const ratingA = ieee738Ampacity(tempC, windMS, attackAngle, line.mot, conductor);
      const stressPct = computeLineStress(actualA, ratingA);
      const overloadTemp = solveOverloadTemp({ ...line, attackAngle }, windMS, windDeg, actualA, conductor);
      
      return {
        id: line.id,
        name: line.name,
        ratingA,
        actualA,
        stressPct,
        overloadTemp,
        conductor: line.conductor,
        mot: line.mot,
      };
    });

    const stresses = results.map(r => r.stressPct);
    const systemStats = computeSystemStressIndex(stresses);

    const response = {
      lines: results,
      system: systemStats,
      conditions: { tempC, windMS, windDeg, scenario },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error computing ratings:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
