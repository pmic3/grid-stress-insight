import { useState, useEffect, useMemo } from 'react';
import Map from '@/components/Map';
import ControlPanel from '@/components/ControlPanel';
import StatsPanel from '@/components/StatsPanel';
import BusDetailsDrawer from '@/components/BusDetailsDrawer';
import OutageControls from '@/components/OutageControls';
import RegionControls from '@/components/RegionControls';
import { ForecastAlertsCard } from '@/components/ForecastAlertsCard';
import { ForecastAlertsDrawer } from '@/components/ForecastAlertsDrawer';
import { Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { OutageSimulator } from '@/utils/outageSimulation';
import { assignBusesToRegions, assignLinesToRegions } from '@/utils/regionUtils';

// Mock data for initial display
const mockLines = [
  {
    id: 'line1',
    name: 'Transmission Line 1',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-157.95, 21.45],
        [-157.85, 21.35],
      ],
    },
    stress: 45.5,
    rating: 1000,
    actual: 455,
  },
  {
    id: 'line2',
    name: 'Transmission Line 2',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-157.85, 21.35],
        [-157.75, 21.25],
      ],
    },
    stress: 78.2,
    rating: 800,
    actual: 626,
  },
  {
    id: 'line3',
    name: 'Transmission Line 3',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-157.75, 21.25],
        [-157.65, 21.15],
      ],
    },
    stress: 95.8,
    rating: 1200,
    actual: 1150,
  },
];

const mockStats = {
  systemStressIndex: 0.65,
  stressBands: {
    low: 15,
    medium: 8,
    high: 5,
    overload: 2,
  },
  firstToFail: [
    { name: 'Line 34-35', overloadTemp: 28.5, stress: 95.8 },
    { name: 'Line 12-13', overloadTemp: 29.2, stress: 92.3 },
    { name: 'Line 20-21', overloadTemp: 31.0, stress: 88.7 },
  ],
  avgStress: 64.3,
  maxStress: 95.8,
};

const Index = () => {
  const [temperature, setTemperature] = useState(25);
  const [windSpeed, setWindSpeed] = useState(5);
  const [windDirection, setWindDirection] = useState(90);
  const [scenario, setScenario] = useState<'min' | 'nominal' | 'max'>('nominal');
  const [lines, setLines] = useState(mockLines);
  const [buses, setBuses] = useState<any[]>([]);
  const [stats, setStats] = useState(mockStats);
  const [selectedLine, setSelectedLine] = useState<any>(null);
  const [selectedBus, setSelectedBus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [outageMode, setOutageMode] = useState(false);
  const [cutLines, setCutLines] = useState<string[]>([]);
  const [cutRegions, setCutRegions] = useState<Set<string>>(new Set());
  const [baseStress, setBaseStress] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'manual' | 'current' | 'forecast'>('manual');
  
  // Region state
  const [regions, setRegions] = useState<any[]>([]);
  const [busRegionMap, setBusRegionMap] = useState<globalThis.Map<string, string>>(new globalThis.Map());
  const [lineRegionMap, setLineRegionMap] = useState<globalThis.Map<string, string>>(new globalThis.Map());
  const [showRegions, setShowRegions] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<{
    tempC: number;
    windMS: number;
    windDeg: number;
    asOf: string;
  } | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  
  // Forecast state
  const [forecastData, setForecastData] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastDrawerOpen, setForecastDrawerOpen] = useState(false);
  const [selectedForecastHour, setSelectedForecastHour] = useState<any>(null);
  const [forecastPreviewActive, setForecastPreviewActive] = useState(false);
  
  const { toast } = useToast();

  // Load GeoJSON, buses, and regions on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load lines
        const { data: linesData, error: linesError } = await supabase.functions.invoke('load-grid-data');
        if (linesError) throw linesError;

        if (linesData?.geojson) {
          const features = linesData.geojson.features.filter(
            (f: any) => f.geometry && f.properties.id
          );
          
          const initialLines = features.map((f: any) => ({
            id: f.properties.id,
            name: f.properties.LineName,
            geometry: f.geometry,
            stress: 0,
            rating: 0,
            actual: 0,
          }));
          
          setLines(initialLines);
        }

        // Load buses
        const { data: busesData, error: busesError } = await supabase.functions.invoke('buses');
        if (busesError) {
          console.error('Bus loading error:', busesError);
          throw busesError;
        }

        if (busesData?.buses) {
          console.log('Bus data received:', busesData.buses.length, 'buses');
          console.log('Sample bus:', busesData.buses[0]);
          setBuses(busesData.buses);
        } else {
          console.warn('No buses data in response');
        }

        // Load regions
        const regionsResponse = await fetch('/data/regions.geojson');
        const regionsData = await regionsResponse.json();
        if (regionsData?.features) {
          const regionFeatures = regionsData.features.map((f: any) => ({
            id: f.properties.id,
            name: f.properties.name,
            geometry: f.geometry,
          }));
          setRegions(regionFeatures);
        }
      } catch (error) {
        console.error('Error loading grid data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load grid data.',
          variant: 'destructive',
        });
      }
    };

    loadData();
  }, []);

  // Assign buses and lines to regions when data is loaded
  useEffect(() => {
    if (buses.length > 0 && regions.length > 0 && lines.length > 0) {
      const busRegions = assignBusesToRegions(buses, regions);
      const lineRegions = assignLinesToRegions(lines, buses, busRegions);
      setBusRegionMap(busRegions);
      setLineRegionMap(lineRegions);
      console.log('Region assignments:', {
        busesAssigned: busRegions.size,
        linesAssigned: lineRegions.size,
      });
    }
  }, [buses.length, regions.length, lines.length]);

  // Fetch weather when entering Current mode
  const fetchWeather = async () => {
    setIsLoadingWeather(true);
    try {
      const { data, error } = await supabase.functions.invoke('weather-current');
      if (error) throw error;
      
      if (data) {
        setWeatherData(data);
        setTemperature(data.tempC);
        setWindSpeed(data.windMS);
        setWindDirection(data.windDeg);
        
        toast({
          title: 'Weather Updated',
          description: `Live conditions: ${data.tempC}°C, ${data.windMS} m/s`,
        });
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
      toast({
        title: 'Weather Fetch Failed',
        description: 'Using fallback values',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Auto-fetch weather when switching to Current mode
  useEffect(() => {
    if (mode === 'current') {
      fetchWeather();
    }
  }, [mode]);

  const handleModeChange = (newMode: 'manual' | 'current' | 'forecast') => {
    setMode(newMode);
    if (newMode === 'manual') {
      setWeatherData(null);
    }
    if (newMode === 'forecast') {
      fetchForecast();
    }
    // Reset forecast preview when switching modes
    setForecastPreviewActive(false);
    setSelectedForecastHour(null);
  };
  
  // Fetch forecast data
  const fetchForecast = async () => {
    try {
      setForecastLoading(true);
      const { data, error } = await supabase.functions.invoke('forecast-analyze', {
        body: { scenario },
      });
      
      if (error) throw error;
      setForecastData(data);
    } catch (error) {
      console.error('Error fetching forecast:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch forecast',
        variant: 'destructive',
      });
    } finally {
      setForecastLoading(false);
    }
  };
  
  // Auto-refresh forecast every 10 minutes when in forecast mode
  useEffect(() => {
    if (mode !== 'forecast') return;
    
    fetchForecast();
    const interval = setInterval(fetchForecast, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mode, scenario]);
  
  // Handle forecast hour preview
  const handlePreviewForecastHour = async (hour: any) => {
    setSelectedForecastHour(hour);
    setForecastPreviewActive(true);
    
    // Compute ratings for this specific hour
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('compute-ratings', {
        body: {
          tempC: hour.tempC,
          windMS: hour.windMS,
          windDeg: hour.windDeg,
          scenario,
        },
      });
      
      if (error) throw error;
      
      // Update lines with forecast data
      const stressById: Record<string, any> = {};
      data.lines.forEach((line: any) => {
        stressById[line.id] = {
          stress: line.stressPct,
          rating: line.ratingA,
          actual: line.actualA,
          overloadTemp: line.overloadTemp,
        };
      });

      setLines(prevLines => prevLines.map(line => ({
        ...line,
        stress: stressById[line.id]?.stress || 0,
        rating: stressById[line.id]?.rating || 0,
        actual: stressById[line.id]?.actual || 0,
        overloadTemp: stressById[line.id]?.overloadTemp || 30,
      })));
      
      if (data.system) {
        const topLines = data.lines
          .sort((a: any, b: any) => b.stressPct - a.stressPct)
          .slice(0, 3);

        setStats({
          systemStressIndex: data.system.ssi,
          stressBands: data.system.bands,
          avgStress: data.system.avgStress,
          maxStress: data.system.maxStress,
          firstToFail: topLines.map((line: any) => ({
            name: line.name,
            overloadTemp: line.overloadTemp || 30,
            stress: line.stressPct,
          })),
        });
      }
    } catch (error) {
      console.error('Error computing forecast ratings:', error);
      toast({
        title: 'Error',
        description: 'Failed to compute forecast ratings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBackToLive = () => {
    setForecastPreviewActive(false);
    setSelectedForecastHour(null);
    // Re-trigger current ratings computation
    if (mode === 'current' && weatherData) {
      setTemperature(weatherData.tempC);
      setWindSpeed(weatherData.windMS);
      setWindDirection(weatherData.windDeg);
    }
  };


  // Fetch and compute ratings when environmental params change (but not in forecast preview mode)
  useEffect(() => {
    if (lines.length === 0 || forecastPreviewActive) return;

    const computeRatings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('compute-ratings', {
          body: {
            tempC: temperature,
            windMS: windSpeed,
            windDeg: windDirection,
            scenario: scenario,
          },
        });

        if (error) throw error;

        if (data && data.lines) {
          console.log('Compute ratings response:', {
            lineCount: data.lines.length,
            sampleLine: data.lines[0],
            sampleStress: data.lines[0]?.stressPct
          });
          
          // Build stress map by line id
          const stressById: Record<string, any> = {};
          data.lines.forEach((line: any) => {
            stressById[line.id] = {
              stress: line.stressPct,
              rating: line.ratingA,
              actual: line.actualA,
              overloadTemp: line.overloadTemp,
            };
          });

          // Store base stress values
          const newBaseStress: Record<string, number> = {};
          data.lines.forEach((line: any) => {
            newBaseStress[line.id] = line.stressPct;
          });
          setBaseStress(newBaseStress);

          // Update lines with new stress values
          setLines(prevLines => {
            const updated = prevLines.map(line => ({
              ...line,
              stress: stressById[line.id]?.stress || 0,
              rating: stressById[line.id]?.rating || 0,
              actual: stressById[line.id]?.actual || 0,
              overloadTemp: stressById[line.id]?.overloadTemp || 30,
            }));
            
            console.log('Updated lines sample:', {
              id: updated[0]?.id,
              stress: updated[0]?.stress,
              rating: updated[0]?.rating
            });
            
            return updated;
          });
          
          if (data.system) {
            const topLines = data.lines
              .sort((a: any, b: any) => b.stressPct - a.stressPct)
              .slice(0, 3);

            setStats({
              systemStressIndex: data.system.ssi,
              stressBands: data.system.bands,
              avgStress: data.system.avgStress,
              maxStress: data.system.maxStress,
              firstToFail: topLines.map((line: any) => ({
                name: line.name,
                overloadTemp: line.overloadTemp || 30,
                stress: line.stressPct,
              })),
            });
          }
        }
      } catch (error) {
        console.error('Error computing ratings:', error);
        toast({
          title: 'Error',
          description: 'Failed to compute line ratings.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    computeRatings();
  }, [temperature, windSpeed, windDirection, scenario, lines.length]);

  // Create outage simulator and calculate adjusted values
  const cutLinesSet = useMemo(() => new Set(cutLines), [cutLines]);
  
  const outageSimulator = useMemo(() => {
    if (lines.length === 0 || buses.length === 0) return null;
    
    // Create a copy with base stress before any adjustments
    const linesWithBaseStress = lines.map(line => ({
      ...line,
      stress: baseStress[line.id] || line.stress
    }));
    
    return new OutageSimulator(linesWithBaseStress, buses);
  }, [lines.length, buses.length, baseStress]);

  const { adjustedLines, adjustedStats } = useMemo(() => {
    if (!outageSimulator || cutLinesSet.size === 0) {
      return { adjustedLines: lines, adjustedStats: stats };
    }

    // Use base stress for calculations
    const linesWithBaseStress = lines.map(line => ({
      ...line,
      stress: baseStress[line.id] || line.stress
    }));

    // Calculate adjusted stress
    const adjustedStressMap = outageSimulator.calculateAdjustedStress(linesWithBaseStress, cutLinesSet);
    
    // Create adjusted lines with new stress values
    const newAdjustedLines = lines.map(line => {
      const adjustedStress = adjustedStressMap.get(line.id);
      return {
        ...line,
        stress: adjustedStress === null ? 0 : (adjustedStress || line.stress),
        isCut: adjustedStress === null,
      };
    });

    // Calculate new system stats
    const systemStats = outageSimulator.calculateSystemStats(linesWithBaseStress, adjustedStressMap);
    
    // Get top stressed lines for "first to fail"
    const activeLines = newAdjustedLines
      .filter(l => !l.isCut)
      .sort((a, b) => b.stress - a.stress)
      .slice(0, 3);

    const newStats = {
      systemStressIndex: systemStats.ssi,
      stressBands: systemStats.bands,
      avgStress: systemStats.avgStress,
      maxStress: systemStats.maxStress,
      firstToFail: activeLines.map(line => ({
        name: line.name,
        overloadTemp: (line as any).overloadTemp || 30,
        stress: line.stress,
      })),
    };

    return { adjustedLines: newAdjustedLines, adjustedStats: newStats };
  }, [lines, stats, cutLinesSet, outageSimulator, baseStress]);

  const handleLineClick = (line: any) => {
    console.log('handleLineClick called:', { lineId: line.id, outageMode });
    
    // If in outage mode, toggle line cut status
    if (outageMode) {
      console.log('Outage mode active, toggling line:', line.id);
      setCutLines(prev => {
        const isCut = prev.includes(line.id);
        if (isCut) {
          toast({
            title: 'Line Restored',
            description: `${line.name} is back in service`,
          });
          return prev.filter(id => id !== line.id);
        } else {
          toast({
            title: 'Line Cut',
            description: `${line.name} marked as out-of-service`,
            variant: 'destructive',
          });
          return [...prev, line.id];
        }
      });
      return;
    }

    console.log('Normal mode, showing line details');
    // Normal line selection for details
    setSelectedLine({
      name: line.name,
      rating: line.rating,
      actual: line.actual,
      stress: line.stress,
      overloadTemp: 35 + Math.random() * 10,
      overloadWind: 2 + Math.random() * 3,
      conductor: 'ACSR 795',
      mot: 75,
    });
    setSelectedBus(null);
    
    toast({
      title: line.name,
      description: `Stress: ${line.stress.toFixed(1)}% | Rating: ${line.rating}A`,
    });
  };

  const handleBusClick = (bus: any, connectedLines: any[]) => {
    const sortedLines = connectedLines
      .sort((a, b) => b.stress - a.stress)
      .map(line => ({
        id: line.id,
        name: line.name,
        stress: line.stress,
      }));

    const avgStress = connectedLines.length > 0
      ? connectedLines.reduce((sum, l) => sum + l.stress, 0) / connectedLines.length
      : 0;

    setSelectedBus({
      ...bus,
      connectedLines: sortedLines,
      avgStress,
    });
    setSelectedLine(null);

    toast({
      title: bus.name,
      description: `${bus.v_nom} kV | ${bus.degree} lines | Avg stress: ${avgStress.toFixed(1)}%`,
    });
  };

  const handleRestoreAll = () => {
    setCutLines([]);
    setCutRegions(new Set());
    toast({
      title: 'All Lines Restored',
      description: 'Grid restored to normal operation',
    });
  };

  const handleRegionCut = (regionId: string) => {
    // Find all lines in this region
    const regionLineIds = lines
      .filter(line => lineRegionMap.get(line.id) === regionId)
      .map(line => line.id);
    
    setCutLines(prev => [...new Set([...prev, ...regionLineIds])]);
    setCutRegions(prev => new Set([...prev, regionId]));
    
    toast({
      title: 'Region Cut',
      description: `All lines in ${regions.find(r => r.id === regionId)?.name} marked as out-of-service`,
      variant: 'destructive',
    });
  };

  const handleRegionRestore = (regionId: string) => {
    // Find all lines in this region
    const regionLineIds = lines
      .filter(line => lineRegionMap.get(line.id) === regionId)
      .map(line => line.id);
    
    setCutLines(prev => prev.filter(id => !regionLineIds.includes(id)));
    setCutRegions(prev => {
      const newSet = new Set(prev);
      newSet.delete(regionId);
      return newSet;
    });
    
    toast({
      title: 'Region Restored',
      description: `${regions.find(r => r.id === regionId)?.name} is back in service`,
    });
  };

  const handleRegionClick = (regionId: string) => {
    if (!outageMode) {
      setSelectedRegion(prev => prev === regionId ? null : regionId);
      return;
    }
    
    // In outage mode, toggle region cut status
    if (cutRegions.has(regionId)) {
      handleRegionRestore(regionId);
    } else {
      handleRegionCut(regionId);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-grid-pattern bg-[size:50px_50px] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background"></div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border bg-card/30 backdrop-blur-md">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  GeoStress
                  <span className="text-primary ml-2">Dynamic Line Rating System</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Real-time transmission line thermal stress analysis
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">
            {/* Control Panel */}
            <div className="lg:col-span-3 overflow-y-auto space-y-4">
              <ControlPanel
                temperature={temperature}
                windSpeed={windSpeed}
                windDirection={windDirection}
                scenario={scenario}
                mode={mode}
                weatherData={weatherData}
                isLoadingWeather={isLoadingWeather}
                onTemperatureChange={setTemperature}
                onWindSpeedChange={setWindSpeed}
                onWindDirectionChange={setWindDirection}
                onScenarioChange={setScenario}
                onModeChange={handleModeChange}
                onRefreshWeather={fetchWeather}
              />
              <OutageControls
                outageMode={outageMode}
                onOutageModeChange={setOutageMode}
                cutLinesCount={cutLines.length}
                onRestoreAll={handleRestoreAll}
              />
              <RegionControls
                regions={regions}
                lines={adjustedLines}
                lineRegionMap={lineRegionMap}
                cutRegions={cutRegions}
                onRegionCut={handleRegionCut}
                onRegionRestore={handleRegionRestore}
                showRegions={showRegions}
                onToggleRegions={() => setShowRegions(!showRegions)}
                selectedRegion={selectedRegion}
                onSelectRegion={setSelectedRegion}
                outageMode={outageMode}
              />
            </div>

            {/* Map */}
            <div className="lg:col-span-6 h-full relative">
              <Map 
                lines={adjustedLines} 
                buses={buses}
                regions={regions}
                lineRegionMap={lineRegionMap}
                cutRegions={cutRegions}
                onLineClick={handleLineClick}
                onBusClick={handleBusClick}
                onRegionClick={handleRegionClick}
                cutLines={cutLinesSet}
                outageMode={outageMode}
                showRegions={showRegions}
                selectedRegion={selectedRegion}
              />
              <BusDetailsDrawer 
                bus={selectedBus} 
                onClose={() => setSelectedBus(null)} 
              />
            </div>

            {/* Stats Panel */}
            <div className="lg:col-span-3 overflow-y-auto space-y-4">
              <StatsPanel 
                stats={adjustedStats} 
                selectedLine={selectedLine}
                lines={adjustedLines}
              />
              
              {mode === 'forecast' && (
                <ForecastAlertsCard
                  data={forecastData}
                  loading={forecastLoading}
                  onViewDetails={() => setForecastDrawerOpen(true)}
                  onRefresh={fetchForecast}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border bg-card/30 backdrop-blur-md py-4">
          <div className="container mx-auto px-6">
            <p className="text-center text-sm text-muted-foreground">
              AEP Dynamic Grid Challenge 2025 | Hackathon Project
            </p>
          </div>
        </footer>
      </div>
      
      <ForecastAlertsDrawer
        open={forecastDrawerOpen}
        onOpenChange={setForecastDrawerOpen}
        data={forecastData}
        onPreviewHour={handlePreviewForecastHour}
        onBackToLive={handleBackToLive}
        selectedHour={selectedForecastHour}
      />
    </div>
  );
};

export default Index;
