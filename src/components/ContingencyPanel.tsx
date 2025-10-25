import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContingencyIssue {
  line: string;
  stress: number;
}

interface ContingencyResult {
  outage: string;
  issues: ContingencyIssue[];
  maxStress: number;
}

interface ContingencyPanelProps {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  scenario: string;
  onContingencySelect: (outage: string, issues: ContingencyIssue[]) => void;
}

// TEMPORARY DEBUG HELPER
async function testWithGET(temp: number, windMS: number, windDeg: number, scenario: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const url =
    `${base}/functions/v1/contingency-analysis` +
    `?tempC=${encodeURIComponent(temp)}` +
    `&windMS=${encodeURIComponent(windMS)}` +
    `&windDeg=${encodeURIComponent(windDeg)}` +
    `&scenario=${encodeURIComponent(scenario)}&debug=1`;

  console.log("Testing contingency-analysis via GET:", url);
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: "Invalid JSON", text: await r.text() }));
  console.log("GET test result:", r.status, j);
  return j;
}

export default function ContingencyPanel({
  temperature,
  windSpeed,
  windDirection,
  scenario,
  onContingencySelect,
}: ContingencyPanelProps) {
  const [contingencies, setContingencies] = useState<ContingencyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOutage, setSelectedOutage] = useState<string | null>(null);

  const getStressColor = (stress: number) => {
    if (stress < 70) return "text-green-600";
    if (stress < 90) return "text-yellow-600";
    return "text-red-600";
  };

  const getStressLabel = (stress: number) => {
    if (stress < 70) return "Safe";
    if (stress < 90) return "Warning";
    return "Critical";
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      // TEMP DEBUG — test backend directly without invoke()
      await testWithGET(temperature, windSpeed, windDirection, scenario);
      // You can comment this out once you verify it prints valid JSON

      const { data, error } = await supabase.functions.invoke("contingency-analysis", {
        body: {
          tempC: Number(temperature),
          windMS: Number(windSpeed),
          windDeg: Number(windDirection),
          scenario: String(scenario || "nominal"),
        },
        headers: { "Content-Type": "application/json" }, // ✅ critical
      });

      if (error) {
        console.error("invoke error:", error);
        toast.error(error.message || "Contingency analysis failed");
        return;
      }
      if (!data) {
        toast.error("No data returned from contingency analysis");
        return;
      }
      if (data.error) {
        // backend sent structured error
        console.error("function error:", data.error);
        toast.error(String(data.error));
        return;
      }

      setContingencies(data.contingencies || []);
      toast.success(`Analysis complete: ${data.contingencies?.length ?? 0} critical contingencies found`);
    } catch (err) {
      console.error("Contingency analysis invoke failed:", err);
      toast.error("Unexpected error running contingency analysis");
    } finally {
      setLoading(false);
    }
  };

  const handleContingencyClick = (contingency: ContingencyResult) => {
    setSelectedOutage(contingency.outage);
    onContingencySelect(contingency.outage, contingency.issues);
  };

  const totalHighStressLines = contingencies.reduce((sum, c) => sum + c.issues.filter((i) => i.stress > 80).length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          N-1 Contingency Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runAnalysis} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Analysis...
            </>
          ) : (
            "Run N-1 Analysis"
          )}
        </Button>

        {contingencies.length > 0 && (
          <>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{totalHighStressLines} lines exceed 80% stress under worst outages</p>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {contingencies.map((contingency, idx) => (
                  <Card
                    key={idx}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedOutage === contingency.outage ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleContingencyClick(contingency)}
                  >
                    <CardContent className="p-4">
                      <div className="font-medium text-sm mb-2">Outage: {contingency.outage}</div>
                      <div className="space-y-1">
                        {contingency.issues.slice(0, 3).map((issue, issueIdx) => (
                          <div key={issueIdx} className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground truncate">▸ {issue.line}</span>
                            <span className={`font-semibold ml-2 ${getStressColor(issue.stress)}`}>
                              {issue.stress}%
                            </span>
                          </div>
                        ))}
                        {contingency.issues.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{contingency.issues.length - 3} more affected lines
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {!loading && contingencies.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Click "Run N-1 Analysis" to simulate line outages
          </div>
        )}
      </CardContent>
    </Card>
  );
}
