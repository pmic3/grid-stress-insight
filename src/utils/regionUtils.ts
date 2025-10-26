interface Point {
  lon: number;
  lat: number;
}

interface Region {
  id: string;
  name: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

interface Bus {
  id: string;
  name: string;
  lon: number;
  lat: number;
  [key: string]: any;
}

interface Line {
  id: string;
  name: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  [key: string]: any;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(point: Point, polygon: number[][]): boolean {
  const { lon, lat } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Assign buses to regions based on point-in-polygon test
 */
export function assignBusesToRegions(buses: Bus[], regions: Region[]): Map<string, string> {
  const busRegionMap = new Map<string, string>();

  buses.forEach(bus => {
    const point = { lon: bus.lon, lat: bus.lat };
    
    for (const region of regions) {
      const polygon = region.geometry.coordinates[0];
      if (pointInPolygon(point, polygon)) {
        busRegionMap.set(bus.id, region.id);
        break;
      }
    }
  });

  return busRegionMap;
}

/**
 * Assign lines to regions based on endpoint buses
 * Returns region ID or 'INTERTIE' if endpoints are in different regions
 */
export function assignLinesToRegions(
  lines: Line[],
  buses: Bus[],
  busRegionMap: Map<string, string>
): Map<string, string> {
  const lineRegionMap = new Map<string, string>();
  
  // Create bus name to bus map for quick lookup
  const busMap = new Map<string, Bus>();
  buses.forEach(bus => busMap.set(bus.name, bus));

  lines.forEach(line => {
    // Extract bus names from line name (format: "BUS1 (id) TO BUS2 (id)")
    const matches = line.name.match(/^(.+?)\s+\(\d+\)\s+TO\s+(.+?)\s+\(\d+\)/i);
    
    if (!matches) {
      lineRegionMap.set(line.id, 'UNKNOWN');
      return;
    }

    const bus1Name = matches[1].trim();
    const bus2Name = matches[2].trim();
    
    const bus1 = busMap.get(bus1Name);
    const bus2 = busMap.get(bus2Name);
    
    if (!bus1 || !bus2) {
      lineRegionMap.set(line.id, 'UNKNOWN');
      return;
    }

    const region1 = busRegionMap.get(bus1.id);
    const region2 = busRegionMap.get(bus2.id);

    if (!region1 || !region2) {
      lineRegionMap.set(line.id, 'UNKNOWN');
    } else if (region1 === region2) {
      lineRegionMap.set(line.id, region1);
    } else {
      lineRegionMap.set(line.id, 'INTERTIE');
    }
  });

  return lineRegionMap;
}

/**
 * Calculate centroid of a polygon for label placement
 */
export function calculateCentroid(coordinates: number[][]): [number, number] {
  let x = 0, y = 0;
  const n = coordinates.length;

  coordinates.forEach(coord => {
    x += coord[0];
    y += coord[1];
  });

  return [x / n, y / n];
}

/**
 * Calculate region statistics
 */
export function calculateRegionStats(
  regionId: string,
  lines: any[],
  lineRegionMap: Map<string, string>
) {
  const regionLines = lines.filter(line => 
    lineRegionMap.get(line.id) === regionId && !line.isCut
  );

  if (regionLines.length === 0) {
    return {
      maxStress: 0,
      avgStress: 0,
      activeLines: 0,
      over95: 0,
      over100: 0,
      ssi: 0,
    };
  }

  const stresses = regionLines.map(l => l.stress);
  const maxStress = Math.max(...stresses);
  const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
  const over95 = regionLines.filter(l => l.stress >= 95).length;
  const over100 = regionLines.filter(l => l.stress >= 100).length;

  // Calculate region SSI (similar to system SSI)
  const ssi = stresses.reduce((sum, stress) => {
    const normalized = stress / 100;
    return sum + Math.pow(normalized, 2);
  }, 0) / stresses.length;

  return {
    maxStress,
    avgStress,
    activeLines: regionLines.length,
    over95,
    over100,
    ssi,
  };
}
