import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Unplug, RotateCcw, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface OutageControlsProps {
  outageMode: boolean;
  onOutageModeChange: (enabled: boolean) => void;
  cutLinesCount: number;
  onRestoreAll: () => void;
}

const OutageControls = ({
  outageMode,
  onOutageModeChange,
  cutLinesCount,
  onRestoreAll,
}: OutageControlsProps) => {
  return (
    <Card className="p-4 bg-card/50 backdrop-blur-sm border-border shadow-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Unplug className="w-5 h-5 text-primary" />
            Outage Simulation
          </h3>
          {cutLinesCount > 0 && (
            <Badge variant="destructive" className="font-mono">
              {cutLinesCount} {cutLinesCount === 1 ? 'Outage' : 'Outages'}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-2">
            <Switch
              id="outage-mode"
              checked={outageMode}
              onCheckedChange={onOutageModeChange}
            />
            <Label htmlFor="outage-mode" className="text-sm font-medium cursor-pointer">
              Enable Outage Mode
            </Label>
          </div>
        </div>

        {outageMode && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Click transmission lines to mark them as out-of-service. Stress will redistribute to neighboring lines.
              </p>
            </div>

            {cutLinesCount > 0 && (
              <Button
                onClick={onRestoreAll}
                variant="outline"
                className="w-full border-success/50 hover:bg-success/10 hover:border-success"
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restore All Lines
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default OutageControls;
