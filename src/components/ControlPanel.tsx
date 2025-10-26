import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Wind, Thermometer, Cloud, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ControlPanelProps {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  scenario: 'min' | 'nominal' | 'max';
  mode: 'manual' | 'current' | 'forecast';
  weatherData: {
    tempC: number;
    windMS: number;
    windDeg: number;
    asOf: string;
  } | null;
  isLoadingWeather: boolean;
  onTemperatureChange: (value: number) => void;
  onWindSpeedChange: (value: number) => void;
  onWindDirectionChange: (value: number) => void;
  onScenarioChange: (scenario: 'min' | 'nominal' | 'max') => void;
  onModeChange: (mode: 'manual' | 'current' | 'forecast') => void;
  onRefreshWeather: () => void;
}

const ControlPanel = ({
  temperature,
  windSpeed,
  windDirection,
  scenario,
  mode,
  weatherData,
  isLoadingWeather,
  onTemperatureChange,
  onWindSpeedChange,
  onWindDirectionChange,
  onScenarioChange,
  onModeChange,
  onRefreshWeather,
}: ControlPanelProps) => {
  const isManualMode = mode === 'manual';

  const formatTimeAgo = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  return (
    <Card className="p-6 space-y-6 bg-card/50 backdrop-blur-sm border-border shadow-glow">
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          Environmental Controls
        </h2>
      </div>

      {/* Mode Selector */}
      <div className="space-y-3 pb-4 border-b border-border">
        <Label className="text-foreground">Control Mode</Label>
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as 'manual' | 'current' | 'forecast')}>
          <TabsList className="grid w-full grid-cols-3 bg-muted">
            <TabsTrigger value="manual" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Thermometer className="w-4 h-4 mr-2" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="current" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Cloud className="w-4 h-4 mr-2" />
              Current
            </TabsTrigger>
            <TabsTrigger value="forecast" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Wind className="w-4 h-4 mr-2" />
              Forecast
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Current Weather Display */}
      {mode === 'current' && (
        <Card className="p-4 bg-blue-500/10 border-blue-500/20">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-500" />
                Live Weather (Oʻahu)
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRefreshWeather}
                disabled={isLoadingWeather}
                className="h-7 px-2"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingWeather ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {weatherData && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Temperature:</span>
                  <Badge variant="secondary">{weatherData.tempC}°C</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Wind:</span>
                  <Badge variant="secondary">{weatherData.windMS} m/s from {weatherData.windDeg}°</Badge>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Updated {formatTimeAgo(weatherData.asOf)}
                </div>
              </div>
            )}
            {isLoadingWeather && !weatherData && (
              <div className="text-sm text-muted-foreground text-center py-2">
                Fetching weather data...
              </div>
            )}
          </div>
        </Card>
      )}
      
      {/* Forecast Mode Display */}
      {mode === 'forecast' && (
        <Card className="p-4 bg-primary/10 border-primary/20">
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">
              Forecast mode active. View the Forecast Alerts panel for 24-hour predictions.
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-foreground">
              <Thermometer className="w-4 h-4 text-primary" />
              Ambient Temperature
            </Label>
            <span className="text-2xl font-bold text-primary">{temperature}°C</span>
          </div>
          <Slider
            value={[temperature]}
            onValueChange={(values) => onTemperatureChange(values[0])}
            min={0}
            max={50}
            step={1}
            className="py-2"
            disabled={!isManualMode}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0°C</span>
            <span>50°C</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-foreground">
              <Wind className="w-4 h-4 text-primary" />
              Wind Speed
            </Label>
            <span className="text-2xl font-bold text-primary">{windSpeed} m/s</span>
          </div>
          <Slider
            value={[windSpeed]}
            onValueChange={(values) => onWindSpeedChange(values[0])}
            min={0}
            max={20}
            step={0.5}
            className="py-2"
            disabled={!isManualMode}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0 m/s</span>
            <span>20 m/s</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground">Wind Direction</Label>
            <span className="text-2xl font-bold text-primary">{windDirection}°</span>
          </div>
          <Slider
            value={[windDirection]}
            onValueChange={(values) => onWindDirectionChange(values[0])}
            min={0}
            max={360}
            step={15}
            className="py-2"
            disabled={!isManualMode}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>N (0°)</span>
            <span>E (90°)</span>
            <span>S (180°)</span>
            <span>W (270°)</span>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-border">
          <Label className="text-foreground">Load Scenario</Label>
          <Tabs value={scenario} onValueChange={(v) => onScenarioChange(v as any)}>
            <TabsList className="grid w-full grid-cols-3 bg-muted">
              <TabsTrigger value="min" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Minimum
              </TabsTrigger>
              <TabsTrigger value="nominal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Nominal
              </TabsTrigger>
              <TabsTrigger value="max" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Maximum
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {scenario === 'min' && 'Load 15% below nominal'}
            {scenario === 'nominal' && 'Standard operating load'}
            {scenario === 'max' && 'Load 15% above nominal'}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default ControlPanel;
