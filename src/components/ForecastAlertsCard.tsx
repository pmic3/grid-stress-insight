import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";

interface ForecastData {
  asOf: string;
  horizonHours: number;
  hours: Array<{
    time: string;
    tempC: number;
    windMS: number;
    windDeg: number;
    maxStress: number;
    countOver95: number;
    countOver100: number;
  }>;
  summary: {
    worstHourIndex: number;
    worstMaxStress: number;
    totalHoursOver95: number;
    totalHoursOver100: number;
  };
}

interface ForecastAlertsCardProps {
  data: ForecastData | null;
  loading: boolean;
  onViewDetails: () => void;
  onRefresh: () => void;
}

export const ForecastAlertsCard = ({ data, loading, onViewDetails, onRefresh }: ForecastAlertsCardProps) => {
  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Forecast Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading forecast...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.hours.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Forecast Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">No forecast data available</p>
          <Button onClick={onRefresh} size="sm" variant="outline" className="w-full">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { summary, hours } = data;
  const worstHour = hours[summary.worstHourIndex];
  
  // Determine alert level
  const isCritical = summary.totalHoursOver100 > 0;
  const isWarning = summary.totalHoursOver95 > 0;
  const isNormal = !isWarning && !isCritical;

  // Format worst hour time
  const worstTime = new Date(worstHour.time).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Pacific/Honolulu',
  });

  // Mini sparkline data (SVG polyline)
  const sparklinePoints = hours.map((h, i) => {
    const x = (i / (hours.length - 1)) * 200;
    const y = 40 - (h.maxStress / 150) * 40; // Scale to 0-40 height, max at 150%
    return `${x},${y}`;
  }).join(' ');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Forecast Alerts</CardTitle>
          {isCritical && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Critical
            </Badge>
          )}
          {isWarning && !isCritical && (
            <Badge variant="default" className="gap-1 bg-amber-500">
              <AlertTriangle className="h-3 w-3" />
              Warning
            </Badge>
          )}
          {isNormal && (
            <Badge variant="secondary" className="gap-1 bg-green-500/20 text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Normal
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {isNormal ? (
              "No overloads expected in next 24h"
            ) : (
              <>
                Worst at {worstTime} HST: {summary.worstMaxStress.toFixed(1)}% max stress
              </>
            )}
          </p>
          {!isNormal && (
            <p className="text-xs text-muted-foreground">
              {summary.totalHoursOver95} hrs ≥95%, {summary.totalHoursOver100} hrs ≥100%
            </p>
          )}
        </div>

        {/* Mini sparkline */}
        <div className="relative">
          <svg width="200" height="40" className="w-full" style={{ maxWidth: '100%' }}>
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
            {/* Threshold lines */}
            <line x1="0" y1="14.67" x2="200" y2="14.67" stroke="hsl(var(--destructive))" strokeWidth="1" strokeDasharray="2,2" opacity="0.3" />
            <line x1="0" y1="15.33" x2="200" y2="15.33" stroke="hsl(var(--warning))" strokeWidth="1" strokeDasharray="2,2" opacity="0.3" />
          </svg>
          <p className="text-xs text-muted-foreground mt-1">Next 24 hours (max stress per hour)</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={onViewDetails} size="sm" className="flex-1">
            View Details
          </Button>
          <Button onClick={onRefresh} size="sm" variant="outline">
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
