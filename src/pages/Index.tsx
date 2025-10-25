import { useState, useEffect } from 'react';
import Map from '@/components/Map';
import ControlPanel from '@/components/ControlPanel';
import StatsPanel from '@/components/StatsPanel';
import { Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const [stats, setStats] = useState(mockStats);
  const [selectedLine, setSelectedLine] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // TODO: Call backend to compute ratings when environmental params change
    // For now, we'll simulate some updates
    const updatedLines = mockLines.map(line => ({
      ...line,
      stress: Math.min(100, line.stress + (temperature - 25) * 0.5 - (windSpeed - 5) * 0.3),
    }));
    setLines(updatedLines);
  }, [temperature, windSpeed, windDirection, scenario]);

  const handleLineClick = (line: any) => {
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
    
    toast({
      title: line.name,
      description: `Stress: ${line.stress.toFixed(1)}% | Rating: ${line.rating}A`,
    });
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
            <div className="lg:col-span-3 overflow-y-auto">
              <ControlPanel
                temperature={temperature}
                windSpeed={windSpeed}
                windDirection={windDirection}
                scenario={scenario}
                onTemperatureChange={setTemperature}
                onWindSpeedChange={setWindSpeed}
                onWindDirectionChange={setWindDirection}
                onScenarioChange={setScenario}
              />
            </div>

            {/* Map */}
            <div className="lg:col-span-6 h-full">
              <Map lines={lines} onLineClick={handleLineClick} />
            </div>

            {/* Stats Panel */}
            <div className="lg:col-span-3 overflow-y-auto">
              <StatsPanel stats={stats} selectedLine={selectedLine} />
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
    </div>
  );
};

export default Index;
