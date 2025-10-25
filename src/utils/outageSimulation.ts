interface LineData {
  id: string;
  name: string;
  stress: number;
  overloadTemp?: number;
  [key: string]: any;
}

interface BusData {
  id: string;
  name: string;
  [key: string]: any;
}

export class OutageSimulator {
  private busToLines: Map<string, Set<string>> = new Map();
  private lineToBuses: Map<string, [string, string]> = new Map();

  constructor(lines: LineData[], buses: BusData[]) {
    this.buildAdjacency(lines, buses);
  }

  private buildAdjacency(lines: LineData[], buses: BusData[]) {
    // Extract bus names from line names (format: "BUS1 TO BUS2")
    lines.forEach(line => {
      const matches = line.name.match(/^(.+?)\s+\(\d+\)\s+TO\s+(.+?)\s+\(\d+\)/i);
      if (matches) {
        const bus1 = matches[1].trim();
        const bus2 = matches[2].trim();

        // Add to busToLines map
        if (!this.busToLines.has(bus1)) {
          this.busToLines.set(bus1, new Set());
        }
        if (!this.busToLines.has(bus2)) {
          this.busToLines.set(bus2, new Set());
        }
        this.busToLines.get(bus1)!.add(line.id);
        this.busToLines.get(bus2)!.add(line.id);

        // Add to lineToBuses map
        this.lineToBuses.set(line.id, [bus1, bus2]);
      }
    });
  }

  /**
   * Calculate adjusted stress for all lines given a set of cut lines
   */
  calculateAdjustedStress(
    lines: LineData[],
    cutLines: Set<string>
  ): Map<string, number | null> {
    const adjustedStress = new Map<string, number | null>();

    lines.forEach(line => {
      if (cutLines.has(line.id)) {
        // Cut lines have null stress (not operational)
        adjustedStress.set(line.id, null);
      } else {
        // Count how many cut lines share buses with this line
        const buses = this.lineToBuses.get(line.id);
        if (!buses) {
          adjustedStress.set(line.id, line.stress);
          return;
        }

        const [bus1, bus2] = buses;
        let incidentCuts = 0;

        // Check bus1 connections
        const bus1Lines = this.busToLines.get(bus1);
        if (bus1Lines) {
          bus1Lines.forEach(connectedLineId => {
            if (cutLines.has(connectedLineId)) {
              incidentCuts++;
            }
          });
        }

        // Check bus2 connections
        const bus2Lines = this.busToLines.get(bus2);
        if (bus2Lines) {
          bus2Lines.forEach(connectedLineId => {
            if (cutLines.has(connectedLineId)) {
              incidentCuts++;
            }
          });
        }

        // Calculate stress increase factor
        // Each incident cut adds 30% more stress, capped at 60% increase
        const factor = 1 + Math.min(incidentCuts * 0.30, 0.60);
        adjustedStress.set(line.id, line.stress * factor);
      }
    });

    return adjustedStress;
  }

  /**
   * Recalculate system statistics excluding cut lines
   */
  calculateSystemStats(lines: LineData[], adjustedStress: Map<string, number | null>) {
    const activeLinesStress: number[] = [];
    const bands = {
      low: 0,
      medium: 0,
      high: 0,
      overload: 0,
    };

    lines.forEach(line => {
      const stress = adjustedStress.get(line.id);
      if (stress === null || stress === undefined) return; // Skip cut lines

      activeLinesStress.push(stress);

      // Categorize into bands
      if (stress < 70) bands.low++;
      else if (stress < 90) bands.medium++;
      else if (stress < 100) bands.high++;
      else bands.overload++;
    });

    if (activeLinesStress.length === 0) {
      return {
        ssi: 0,
        avgStress: 0,
        maxStress: 0,
        bands,
      };
    }

    const avgStress = activeLinesStress.reduce((a, b) => a + b, 0) / activeLinesStress.length;
    const maxStress = Math.max(...activeLinesStress);

    // SSI calculation: weighted average with emphasis on high stress
    const ssi = activeLinesStress.reduce((sum, stress) => {
      const normalized = stress / 100;
      return sum + Math.pow(normalized, 2); // Square emphasizes high values
    }, 0) / activeLinesStress.length;

    return {
      ssi,
      avgStress,
      maxStress,
      bands,
    };
  }
}
