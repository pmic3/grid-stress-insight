import { Card } from '@/components/ui/card';
import { AlertTriangle, Activity, Zap, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface SystemStats {
  systemStressIndex: number;
  stressBands: {
    low: number;
    medium: number;
    high: number;
    overload: number;
  };
  firstToFail: Array<{
    name: string;
    overloadTemp: number;
    stress: number;
  }>;
  avgStress: number;
  maxStress: number;
}

interface StatsPanelProps {
  stats: SystemStats;
  selectedLine?: {
    name: string;
    rating: number;
    actual: number;
    stress: number;
    overloadTemp: number;
    overloadWind: number;
    conductor: string;
    mot: number;
  } | null;
}

const StatsPanel = ({ stats, selectedLine }: StatsPanelProps) => {
  const getStressColor = (stress: number) => {
    if (stress < 70) return 'text-success';
    if (stress < 90) return 'text-warning';
    if (stress < 100) return 'text-destructive';
    return 'text-destructive';
  };

  const getStressLabel = (ssi: number) => {
    if (ssi < 0.3) return { label: 'LOW', color: 'text-success' };
    if (ssi < 0.6) return { label: 'MODERATE', color: 'text-warning' };
    if (ssi < 0.8) return { label: 'HIGH', color: 'text-destructive' };
    return { label: 'CRITICAL', color: 'text-destructive font-bold' };
  };

  const stressStatus = getStressLabel(stats.systemStressIndex);

  return (
    <div className="space-y-4">
      {/* System Stress Index */}
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border shadow-glow">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              System Stress Index
            </h3>
            <span className={`text-2xl font-bold ${stressStatus.color}`}>
              {stressStatus.label}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SSI Value</span>
              <span className="font-mono text-primary">{(stats.systemStressIndex * 100).toFixed(1)}%</span>
            </div>
            <Progress value={stats.systemStressIndex * 100} className="h-3" />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">Avg Stress</div>
              <div className={`text-xl font-bold ${getStressColor(stats.avgStress)}`}>
                {stats.avgStress.toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">Max Stress</div>
              <div className={`text-xl font-bold ${getStressColor(stats.maxStress)}`}>
                {stats.maxStress.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stress Distribution */}
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Stress Distribution
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-success">Safe (&lt;70%)</span>
            <span className="font-mono text-success font-semibold">{stats.stressBands.low} lines</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-warning">Warning (70-90%)</span>
            <span className="font-mono text-warning font-semibold">{stats.stressBands.medium} lines</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-destructive">High (90-100%)</span>
            <span className="font-mono text-destructive font-semibold">{stats.stressBands.high} lines</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-destructive font-bold">Overload (&gt;100%)</span>
            <span className="font-mono text-destructive font-bold">{stats.stressBands.overload} lines</span>
          </div>
        </div>
      </Card>

      {/* First to Fail */}
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          First to Fail
        </h3>
        <div className="space-y-3">
          {stats.firstToFail.slice(0, 5).map((line, idx) => (
            <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-foreground">{line.name}</span>
                <span className={`text-sm font-bold ${getStressColor(line.stress)}`}>
                  {line.stress.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Overload at {line.overloadTemp.toFixed(1)}°C
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Selected Line Details */}
      {selectedLine && (
        <Card className="p-6 bg-card/50 backdrop-blur-sm border-border border-primary/50 shadow-electric">
          <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Selected Line
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-primary mb-2">{selectedLine.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Current Load</div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {selectedLine.actual.toFixed(0)} A
                </div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Rating</div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {selectedLine.rating.toFixed(0)} A
                </div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Stress Level</div>
                <div className={`font-mono text-sm font-bold ${getStressColor(selectedLine.stress)}`}>
                  {selectedLine.stress.toFixed(1)}%
                </div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Conductor</div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedLine.conductor}
                </div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">MOT</div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedLine.mot}°C
                </div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-xs text-muted-foreground">Overload Temp</div>
                <div className="text-sm font-semibold text-warning">
                  {selectedLine.overloadTemp.toFixed(1)}°C
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default StatsPanel;
