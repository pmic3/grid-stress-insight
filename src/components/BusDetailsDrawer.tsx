import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface BusData {
  id: string;
  name: string;
  v_nom: number;
  degree: number;
  connectedLines: Array<{
    id: string;
    name: string;
    stress: number;
  }>;
  avgStress: number;
}

interface BusDetailsDrawerProps {
  bus: BusData | null;
  onClose: () => void;
}

const BusDetailsDrawer = ({ bus, onClose }: BusDetailsDrawerProps) => {
  if (!bus) return null;

  const hasHighStress = bus.connectedLines.some(line => line.stress > 95);

  return (
    <div className="absolute top-4 right-4 w-96 z-10">
      <Card className="bg-card/95 backdrop-blur-sm border-border shadow-lg">
        <div className="p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {bus.name}
                </h3>
                {hasHighStress && (
                  <Badge variant="destructive" className="text-xs">
                    ⚠️ High Stress
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {bus.v_nom} kV Substation
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Connected Lines</p>
                <p className="text-xl font-semibold text-foreground">{bus.degree}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Stress</p>
                <p className="text-xl font-semibold text-foreground">
                  {bus.avgStress.toFixed(1)}%
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">
                Top Stressed Lines
              </h4>
              <div className="space-y-2">
                {bus.connectedLines.slice(0, 3).map((line, idx) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {line.name}
                      </p>
                    </div>
                    <Badge
                      variant={line.stress > 95 ? 'destructive' : line.stress > 80 ? 'default' : 'secondary'}
                      className="ml-2"
                    >
                      {line.stress.toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BusDetailsDrawer;
