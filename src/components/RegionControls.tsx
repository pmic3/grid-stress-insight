import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Layers, AlertTriangle } from 'lucide-react';
import { calculateRegionStats } from '@/utils/regionUtils';

interface Region {
  id: string;
  name: string;
  geometry: any;
}

interface RegionControlsProps {
  regions: Region[];
  lines: any[];
  lineRegionMap: Map<string, string>;
  cutRegions: Set<string>;
  onRegionCut: (regionId: string) => void;
  onRegionRestore: (regionId: string) => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  selectedRegion: string | null;
  onSelectRegion: (regionId: string | null) => void;
  outageMode: boolean;
}

const RegionControls = ({
  regions,
  lines,
  lineRegionMap,
  cutRegions,
  onRegionCut,
  onRegionRestore,
  showRegions,
  onToggleRegions,
  selectedRegion,
  onSelectRegion,
  outageMode,
}: RegionControlsProps) => {
  const getStressColor = (stress: number) => {
    if (stress >= 100) return 'text-destructive';
    if (stress >= 95) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getRegionBadgeVariant = (regionId: string, stats: any) => {
    if (cutRegions.has(regionId)) return 'secondary' as const;
    if (stats.over100 > 0) return 'destructive' as const;
    if (stats.over95 > 0) return 'default' as const;
    return 'outline' as const;
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Regions</h3>
        </div>
        <Button
          variant={showRegions ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleRegions}
        >
          {showRegions ? 'Hide' : 'Show'}
        </Button>
      </div>

      {showRegions && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {outageMode ? 'Click a region on the map to cut/restore all lines' : 'View grid performance by region'}
          </p>
          
          <div className="space-y-2">
            {regions.map(region => {
              const stats = calculateRegionStats(region.id, lines, lineRegionMap);
              const isCut = cutRegions.has(region.id);
              const isSelected = selectedRegion === region.id;

              return (
                <div
                  key={region.id}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => onSelectRegion(isSelected ? null : region.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{region.name}</span>
                        <Badge variant={getRegionBadgeVariant(region.id, stats)} className="text-xs">
                          {isCut ? 'CUT' : `${stats.activeLines} lines`}
                        </Badge>
                      </div>
                      
                      {!isCut && stats.activeLines > 0 && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Max:</span>
                            <span className={getStressColor(stats.maxStress)}>
                              {stats.maxStress.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg:</span>
                            <span className="text-foreground">{stats.avgStress.toFixed(1)}%</span>
                          </div>
                          {stats.over95 > 0 && (
                            <div className="flex items-center gap-1 col-span-2">
                              <AlertTriangle className="h-3 w-3 text-warning" />
                              <span className="text-warning">
                                {stats.over95} line{stats.over95 > 1 ? 's' : ''} ≥95%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {outageMode && (
                      <Button
                        size="sm"
                        variant={isCut ? 'outline' : 'destructive'}
                        onClick={(e) => {
                          e.stopPropagation();
                          isCut ? onRegionRestore(region.id) : onRegionCut(region.id);
                        }}
                        className="shrink-0"
                      >
                        {isCut ? 'Restore' : 'Cut'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

export default RegionControls;
