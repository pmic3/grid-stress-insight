import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Wind } from "lucide-react";
import { toast } from "sonner";

interface HourData {
  time: string;
  tempC: number;
  windMS: number;
  windDeg: number;
  maxStress: number;
  countOver95: number;
  countOver100: number;
  topLines: Array<{ id: string; name: string; stressPct: number }>;
}

interface ForecastData {
  asOf: string;
  horizonHours: number;
  hours: HourData[];
  summary: {
    worstHourIndex: number;
    worstMaxStress: number;
    totalHoursOver95: number;
    totalHoursOver100: number;
  };
}

interface ForecastAlertsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ForecastData | null;
  onPreviewHour: (hour: HourData) => void;
  onBackToLive: () => void;
  selectedHour: HourData | null;
}

export const ForecastAlertsDrawer = ({
  open,
  onOpenChange,
  data,
  onPreviewHour,
  onBackToLive,
  selectedHour,
}: ForecastAlertsDrawerProps) => {
  if (!data) return null;

  const getStressColor = (stress: number) => {
    if (stress >= 100) return "text-red-600 font-bold";
    if (stress >= 90) return "text-orange-500";
    if (stress >= 70) return "text-yellow-600";
    return "text-green-600";
  };

  const getStressBadge = (stress: number) => {
    if (stress >= 100) return <Badge variant="destructive">Critical</Badge>;
    if (stress >= 95) return <Badge className="bg-amber-500">Warning</Badge>;
    if (stress >= 70) return <Badge variant="secondary">Elevated</Badge>;
    return <Badge variant="outline">Normal</Badge>;
  };

  const handleCopySummary = () => {
    if (!data || !selectedHour) return;
    
    const time = new Date(selectedHour.time).toLocaleString('en-US', {
      timeZone: 'Pacific/Honolulu',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const windMph = Math.round(selectedHour.windMS * 2.236);
    const summary = `Forecast Alert - ${time} HST: ${selectedHour.maxStress.toFixed(1)}% max stress, ${selectedHour.countOver95} lines ≥95%, ${selectedHour.countOver100} lines ≥100% | Weather: ${selectedHour.tempC.toFixed(1)}°C, ${selectedHour.windMS.toFixed(1)} m/s (${windMph} mph) @ ${selectedHour.windDeg}°`;
    
    navigator.clipboard.writeText(summary);
    toast.success("Summary copied to clipboard");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>24-Hour Forecast Analysis</DrawerTitle>
          <DrawerDescription>
            Click any hour to preview its impact on the grid
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 pb-4 space-y-4">
          {/* Hour scroller */}
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {data.hours.map((hour, idx) => {
                const time = new Date(hour.time);
                const isSelected = selectedHour?.time === hour.time;
                const isWorst = idx === data.summary.worstHourIndex;
                
                return (
                  <button
                    key={hour.time}
                    onClick={() => onPreviewHour(hour)}
                    className={`flex-shrink-0 p-3 rounded-lg border-2 transition-all min-w-[120px] ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="text-xs font-medium">
                      {time.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Pacific/Honolulu',
                      })}
                      {isWorst && (
                        <Badge variant="destructive" className="ml-1 text-xs">
                          Worst
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {hour.tempC.toFixed(1)}°C
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wind className="h-3 w-3" />
                      {hour.windMS.toFixed(1)} m/s
                    </div>
                    <div className={`text-sm font-semibold mt-1 ${getStressColor(hour.maxStress)}`}>
                      {hour.maxStress.toFixed(1)}%
                    </div>
                    {hour.countOver95 > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {hour.countOver95} ≥95%
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Selected hour details */}
          {selectedHour && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    {new Date(selectedHour.time).toLocaleString('en-US', {
                      timeZone: 'Pacific/Honolulu',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} HST
                  </h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedHour.tempC.toFixed(1)}°C, {selectedHour.windMS.toFixed(1)} m/s (
                    {Math.round(selectedHour.windMS * 2.236)} mph) @ {selectedHour.windDeg}°
                  </div>
                </div>
                <div className="text-right">
                  {getStressBadge(selectedHour.maxStress)}
                  <div className={`text-2xl font-bold mt-1 ${getStressColor(selectedHour.maxStress)}`}>
                    {selectedHour.maxStress.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Top at-risk lines */}
              <div>
                <h4 className="text-sm font-medium mb-2">Top At-Risk Lines</h4>
                <div className="space-y-2">
                  {selectedHour.topLines.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center justify-between p-2 rounded bg-muted/50"
                    >
                      <div className="flex-1 text-sm truncate">{line.name}</div>
                      <div className={`text-sm font-semibold ml-2 ${getStressColor(line.stressPct)}`}>
                        {line.stressPct.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={onBackToLive} variant="outline" className="flex-1">
                  Back to Live
                </Button>
                <Button onClick={handleCopySummary} variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
