import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GitHub raw content URLs for Hawaii 40 bus dataset
const GITHUB_BASE = 'https://raw.githubusercontent.com/cwebber314/osu_hackathon/main';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Loading grid data from GitHub...');

    // Fetch all required files
    const [linesRes, flowsRes, geojsonRes] = await Promise.all([
      fetch(`${GITHUB_BASE}/hawaii40_osu/csv/lines.csv`),
      fetch(`${GITHUB_BASE}/hawaii40_osu/line_flows_nominal.csv`),
      fetch(`${GITHUB_BASE}/hawaii40_osu/gis/oneline_lines.geojson`),
    ]);

    if (!linesRes.ok || !flowsRes.ok || !geojsonRes.ok) {
      throw new Error('Failed to fetch one or more data files from GitHub');
    }

    const linesCSV = await linesRes.text();
    const flowsCSV = await flowsRes.text();
    const geojson = await geojsonRes.json();

    console.log('Successfully loaded all data files');

    // Parse CSV data
    const parseCSV = (csv: string) => {
      const lines = csv.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => {
          obj[h] = values[i];
        });
        return obj;
      });
    };

    const linesData = parseCSV(linesCSV);
    const flowsData = parseCSV(flowsCSV);

    // Merge data: lines + flows + geometries
    const mergedLines = linesData.map((line: any) => {
      const flow = flowsData.find((f: any) => f.line_id === line.id);
      const geometry = geojson.features.find((f: any) => f.properties.id === line.id);
      
      return {
        id: line.id || line.name,
        name: line.name,
        bus0: line.bus0,
        bus1: line.bus1,
        s_nom: parseFloat(line.s_nom || '0'),
        conductor: line.conductor || 'ACSR 795',
        mot: parseFloat(line.mot || '75'),
        p0_nominal: parseFloat(flow?.p0_nominal || '0'),
        geometry: geometry?.geometry || null,
      };
    });

    const response = {
      lines: mergedLines,
      geojson,
      totalLines: mergedLines.length,
      message: 'Grid data loaded successfully from GitHub',
    };

    console.log(`Processed ${mergedLines.length} transmission lines`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error loading grid data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: 'Failed to load grid data from GitHub repository',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
