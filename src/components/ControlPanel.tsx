import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wind, Thermometer } from 'lucide-react';

interface ControlPanelProps {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  scenario: 'min' | 'nominal' | 'max';
  onTemperatureChange: (value: number) => void;
  onWindSpeedChange: (value: number) => void;
  onWindDirectionChange: (value: number) => void;
  onScenarioChange: (scenario: 'min' | 'nominal' | 'max') => void;
}

const ControlPanel = ({
  temperature,
  windSpeed,
  windDirection,
  scenario,
  onTemperatureChange,
  onWindSpeedChange,
  onWindDirectionChange,
  onScenarioChange,
}: ControlPanelProps) => {
  return (
    <Card className="p-6 space-y-6 bg-card/50 backdrop-blur-sm border-border shadow-glow">
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          Environmental Controls
        </h2>
      </div>

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
