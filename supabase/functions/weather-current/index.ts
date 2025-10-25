import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
let cachedWeather: {
  data: {
    tempC: number;
    windMS: number;
    windDeg: number;
    asOf: string;
    source: {
      provider: string;
      lat: number;
      lon: number;
    };
  };
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const OAHU_LAT = 21.3069;
const OAHU_LON = -157.8583;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check cache
    const now = Date.now();
    if (cachedWeather && (now - cachedWeather.timestamp) < CACHE_DURATION) {
      console.log('Returning cached weather data');
      return new Response(JSON.stringify(cachedWeather.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching fresh weather data from Open-Meteo API');

    // Fetch from Open-Meteo API
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${OAHU_LAT}&longitude=${OAHU_LON}&current=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=celsius&wind_speed_unit=ms`;
    
    const response = await fetch(weatherUrl);
    
    if (!response.ok) {
      throw new Error(`Open-Meteo API returned ${response.status}`);
    }

    const weatherData = await response.json();
    
    // Extract current weather values
    const tempC = weatherData.current.temperature_2m;
    const windMS = weatherData.current.wind_speed_10m;
    const windDeg = weatherData.current.wind_direction_10m;
    const asOf = weatherData.current.time;

    const result = {
      tempC: Math.round(tempC * 10) / 10, // Round to 1 decimal
      windMS: Math.round(windMS * 10) / 10,
      windDeg: Math.round(windDeg),
      asOf,
      source: {
        provider: 'open-meteo',
        lat: OAHU_LAT,
        lon: OAHU_LON,
      },
    };

    // Update cache
    cachedWeather = {
      data: result,
      timestamp: now,
    };

    console.log('Weather data fetched successfully:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching weather data:', error);
    
    // Return fallback data on error
    const fallback = {
      tempC: 25,
      windMS: 3,
      windDeg: 90,
      asOf: new Date().toISOString(),
      source: {
        provider: 'fallback',
        lat: OAHU_LAT,
        lon: OAHU_LON,
      },
    };

    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Still return 200 with fallback data
    });
  }
});
