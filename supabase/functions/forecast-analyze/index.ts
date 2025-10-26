import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ForecastRequest {
  scenario?: 'nominal' | 'min' | 'max';
}

interface HourlyForecast {
  time: string;
  tempC: number;
  windMS: number;
  windDeg: number;
  maxStress: number;
  countOver95: number;
  countOver100: number;
  topLines: Array<{ id: string; name: string; stressPct: number }>;
}

interface ForecastResponse {
  asOf: string;
  horizonHours: number;
  hours: HourlyForecast[];
  summary: {
    worstHourIndex: number;
    worstMaxStress: number;
    totalHoursOver95: number;
    totalHoursOver100: number;
  };
}

// Simple in-memory cache (5 min TTL)
const cache = new Map<string, { data: ForecastResponse; expires: number }>();

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('forecast-analyze: Starting request');
    
    // Parse request
    let scenario: 'nominal' | 'min' | 'max' = 'nominal';
    if (req.method === 'POST') {
      const body = await req.json() as ForecastRequest;
      scenario = body.scenario || 'nominal';
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      scenario = (url.searchParams.get('scenario') as any) || 'nominal';
    }

    // Check cache
    const cacheKey = `forecast_${scenario}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      console.log('forecast-analyze: Returning cached data');
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch weather forecast from Open-Meteo
    const lat = 21.3069;
    const lon = -157.8583;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m&forecast_days=2&timezone=UTC`;
    
    console.log('forecast-analyze: Fetching weather from Open-Meteo');
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error(`Open-Meteo API error: ${weatherRes.status}`);
    }
    
    const weatherData = await weatherRes.json();
    const { hourly } = weatherData;
    
    // Get current hour and next 24 hours
    const now = new Date();
    const currentHourIndex = hourly.time.findIndex((t: string) => new Date(t) >= now);
    const next24Hours = hourly.time.slice(currentHourIndex, currentHourIndex + 24);
    
    console.log(`forecast-analyze: Processing ${next24Hours.length} hours`);
    
    // Get Supabase URL for calling compute-ratings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const hours: HourlyForecast[] = [];
    
    // Process each hour
    for (let i = 0; i < next24Hours.length; i++) {
      const hourTime = next24Hours[i];
      const tempC = hourly.temperature_2m[currentHourIndex + i];
      const windMS = hourly.wind_speed_10m[currentHourIndex + i];
      const windDeg = hourly.wind_direction_10m[currentHourIndex + i];
      
      try {
        // Call compute-ratings for this hour
        const ratingsRes = await fetch(`${supabaseUrl}/functions/v1/compute-ratings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({ tempC, windMS, windDeg, scenario }),
        });
        
        if (!ratingsRes.ok) {
          console.error(`forecast-analyze: compute-ratings failed for hour ${i}: ${ratingsRes.status}`);
          continue;
        }
        
        const ratingsData = await ratingsRes.json();
        const lines = ratingsData.lines || [];
        
        // Calculate metrics
        let maxStress = 0;
        let countOver95 = 0;
        let countOver100 = 0;
        
        for (const line of lines) {
          const stress = line.stressPct || 0;
          if (stress > maxStress) maxStress = stress;
          if (stress >= 95) countOver95++;
          if (stress >= 100) countOver100++;
        }
        
        // Get top 5 stressed lines
        const sortedLines = [...lines].sort((a, b) => (b.stressPct || 0) - (a.stressPct || 0));
        const topLines = sortedLines.slice(0, 5).map(line => ({
          id: line.id,
          name: line.name,
          stressPct: Math.round(line.stressPct * 10) / 10,
        }));
        
        hours.push({
          time: hourTime,
          tempC: Math.round(tempC * 10) / 10,
          windMS: Math.round(windMS * 10) / 10,
          windDeg: Math.round(windDeg),
          maxStress: Math.round(maxStress * 10) / 10,
          countOver95,
          countOver100,
          topLines,
        });
      } catch (err) {
        console.error(`forecast-analyze: Error processing hour ${i}:`, err);
      }
    }
    
    // Calculate summary
    let worstHourIndex = 0;
    let worstMaxStress = 0;
    let totalHoursOver95 = 0;
    let totalHoursOver100 = 0;
    
    for (let i = 0; i < hours.length; i++) {
      const hour = hours[i];
      if (hour.maxStress > worstMaxStress || 
          (hour.maxStress === worstMaxStress && hour.countOver95 > hours[worstHourIndex].countOver95)) {
        worstMaxStress = hour.maxStress;
        worstHourIndex = i;
      }
      if (hour.countOver95 > 0) totalHoursOver95++;
      if (hour.countOver100 > 0) totalHoursOver100++;
    }
    
    const response: ForecastResponse = {
      asOf: new Date().toISOString(),
      horizonHours: 24,
      hours,
      summary: {
        worstHourIndex,
        worstMaxStress: Math.round(worstMaxStress * 10) / 10,
        totalHoursOver95,
        totalHoursOver100,
      },
    };
    
    // Cache for 5 minutes
    cache.set(cacheKey, {
      data: response,
      expires: Date.now() + 5 * 60 * 1000,
    });
    
    console.log('forecast-analyze: Success, returning data');
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('forecast-analyze: Error:', error);
    
    // Return minimal valid response on error
    const errorResponse: ForecastResponse = {
      asOf: new Date().toISOString(),
      horizonHours: 24,
      hours: [],
      summary: {
        worstHourIndex: 0,
        worstMaxStress: 0,
        totalHoursOver95: 0,
        totalHoursOver100: 0,
      },
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
