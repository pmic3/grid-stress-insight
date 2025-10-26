import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LineData {
  id: string;
  name: string;
  geometry: any;
  stress: number;
  rating: number;
  actual: number;
  isCut?: boolean;
}

interface BusData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  v_nom: number;
  degree: number;
}

interface Region {
  id: string;
  name: string;
  geometry: any;
}

interface MapProps {
  lines: LineData[];
  buses: BusData[];
  regions?: Region[];
  lineRegionMap?: Map<string, string>;
  cutRegions?: Set<string>;
  onLineClick?: (line: LineData) => void;
  onBusClick?: (bus: BusData, connectedLines: any[]) => void;
  onRegionClick?: (regionId: string) => void;
  cutLines?: Set<string>;
  outageMode?: boolean;
  showRegions?: boolean;
  selectedRegion?: string | null;
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG1pY29uaSIsImEiOiJjbWNiMGJiMzUwOHY0MmxwejJhazhjcTd6In0.pNow26taTw3mku-wCPQCwA';

const Map = ({ 
  lines, 
  buses, 
  regions = [], 
  lineRegionMap,
  cutRegions,
  onLineClick, 
  onBusClick, 
  onRegionClick,
  cutLines, 
  outageMode = false,
  showRegions = true,
  selectedRegion = null,
}: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const busMarkers = useRef<mapboxgl.Marker[]>([]);
  const regionLabels = useRef<mapboxgl.Marker[]>([]);

  // Provide defaults for Maps and Sets
  const _lineRegionMap = lineRegionMap || new globalThis.Map<string, string>();
  const _cutRegions = cutRegions || new globalThis.Set<string>();
  const _cutLines = cutLines || new globalThis.Set<string>();

  const initializeMap = () => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-157.8, 21.3], // Hawaii coordinates
      zoom: 8,
      pitch: 0,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      console.log('Map loaded');
      if (regions.length > 0) {
        updateRegionLayers();
      }
      updateMapLines();
      if (buses.length > 0) {
        console.log('Adding initial bus markers');
        updateBusMarkers();
      }
    });
  };

  const updateRegionLayers = () => {
    if (!map.current || !map.current.isStyleLoaded() || regions.length === 0) {
      // Even if conditions aren't met, clear labels if showRegions is false
      if (!showRegions && regionLabels.current.length > 0) {
        regionLabels.current.forEach(marker => marker.remove());
        regionLabels.current = [];
      }
      return;
    }

    // Always clear existing labels first
    regionLabels.current.forEach(marker => marker.remove());
    regionLabels.current = [];

    // Remove existing region layers
    if (map.current.getLayer('region-fills')) map.current.removeLayer('region-fills');
    if (map.current.getLayer('region-borders')) map.current.removeLayer('region-borders');
    if (map.current.getSource('regions')) map.current.removeSource('regions');

    // If regions are hidden, don't recreate anything
    if (!showRegions) return;

    // Create GeoJSON for regions
    const regionsGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: regions.map(region => ({
        type: 'Feature',
        properties: {
          id: region.id,
          name: region.name,
          isCut: _cutRegions.has(region.id),
          isSelected: selectedRegion === region.id,
        },
        geometry: region.geometry,
      })),
    };

    map.current.addSource('regions', {
      type: 'geojson',
      data: regionsGeoJSON,
    });

    // Add region fill layer
    map.current.addLayer({
      id: 'region-fills',
      type: 'fill',
      source: 'regions',
      paint: {
        'fill-color': [
          'case',
          ['get', 'isCut'], 'hsl(220, 15%, 35%)',
          ['get', 'isSelected'], 'hsl(199, 89%, 48%)',
          'hsl(199, 89%, 48%)'
        ],
        'fill-opacity': [
          'case',
          ['get', 'isCut'], 0.1,
          ['get', 'isSelected'], 0.2,
          showRegions ? 0.08 : 0
        ],
      },
    }, 'transmission-lines');

    // Add region border layer
    map.current.addLayer({
      id: 'region-borders',
      type: 'line',
      source: 'regions',
      paint: {
        'line-color': [
          'case',
          ['get', 'isCut'], 'hsl(220, 15%, 45%)',
          ['get', 'isSelected'], 'hsl(199, 89%, 58%)',
          'hsl(199, 89%, 48%)'
        ],
        'line-width': [
          'case',
          ['get', 'isSelected'], 2,
          1
        ],
        'line-opacity': showRegions ? 0.4 : 0,
      },
    }, 'transmission-lines');

    // Add region click handler
    map.current.on('click', 'region-fills', (e) => {
      if (e.features && e.features[0] && onRegionClick) {
        const regionId = e.features[0].properties?.id;
        if (regionId) {
          onRegionClick(regionId);
        }
      }
    });

    // Change cursor on region hover
    map.current.on('mouseenter', 'region-fills', () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = 'pointer';
      }
    });

    map.current.on('mouseleave', 'region-fills', () => {
      if (map.current && !outageMode) {
        map.current.getCanvas().style.cursor = '';
      }
    });

    // Add region labels
    if (showRegions) {
      regions.forEach(region => {
        const coords = region.geometry.coordinates[0];
        const centroid = coords.reduce(
          (acc: [number, number], coord: number[]) => [
            acc[0] + coord[0] / coords.length,
            acc[1] + coord[1] / coords.length,
          ],
          [0, 0]
        );

        const el = document.createElement('div');
        el.className = 'region-label';
        el.textContent = region.name;
        el.style.cssText = `
          background: hsl(var(--card) / 0.9);
          color: hsl(var(--foreground));
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid hsl(var(--border));
          backdrop-filter: blur(4px);
          pointer-events: none;
          white-space: nowrap;
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat(centroid as [number, number])
          .addTo(map.current!);

        regionLabels.current.push(marker);
      });
    }
  };

  const getLineColor = (stress: number) => {
    if (stress < 70) return '#2FB56F';
    if (stress < 90) return '#E0C400';
    if (stress < 100) return '#FF7B00';
    return '#E02F2F';
  };

  const getBusColor = (voltage: number) => {
    if (voltage <= 20) return '#8dd3c7';
    if (voltage <= 69) return '#80b1d3';
    if (voltage <= 115) return '#bebada';
    if (voltage <= 230) return '#fb8072';
    return '#fdb462';
  };

  const updateMapLines = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    console.log('Updating map lines:', lines.length);
    console.log('Sample line stress values:', lines.slice(0, 3).map(l => ({ id: l.id, stress: l.stress })));

    // Remove existing layers and sources (handlers are automatically removed)
    if (map.current.getLayer('transmission-lines')) {
      map.current.removeLayer('transmission-lines');
    }
    if (map.current.getSource('lines')) {
      map.current.removeSource('lines');
    }

    // Create GeoJSON from lines data
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lines.map(line => ({
        type: 'Feature',
        properties: {
          id: line.id,
          name: line.name,
          stress: line.stress,
          rating: line.rating,
          actual: line.actual,
          isCut: line.isCut || false,
        },
        geometry: line.geometry,
      })),
    };

    map.current.addSource('lines', {
      type: 'geojson',
      data: geojson,
    });

    console.log('GeoJSON features with stress:', geojson.features.slice(0, 3).map(f => ({ 
      id: f.properties?.id, 
      stress: f.properties?.stress 
    })));

    map.current.addLayer({
      id: 'transmission-lines',
      type: 'line',
      source: 'lines',
      paint: {
        'line-color': [
          'case',
          ['get', 'isCut'], '#6B7280',
          ['<', ['get', 'stress'], 70], '#2FB56F',
          ['<', ['get', 'stress'], 90], '#E0C400',
          ['<', ['get', 'stress'], 100], '#FF7B00',
          '#E02F2F'
        ],
        'line-width': [
          'case',
          ['get', 'isCut'], 2,
          ['>', ['get', 'stress'], 100], 4,
          3
        ],
        'line-opacity': [
          'case',
          ['get', 'isCut'], 0.4,
          0.8
        ],
        'line-dasharray': [
          'case',
          ['get', 'isCut'], ['literal', [2, 2]],
          ['literal', [1, 0]]
        ],
      },
    });

    // Add click handler (fresh closure with current props)
    map.current.on('click', 'transmission-lines', (e) => {
      if (e.features && e.features[0] && onLineClick) {
        const feature = e.features[0];
        const lineData = lines.find(l => l.id === feature.properties?.id);
        if (lineData) {
          console.log('Line clicked:', lineData.id, 'Outage mode:', outageMode);
          onLineClick(lineData);
        }
      }
    });

    // Change cursor on hover based on mode
    map.current.on('mouseenter', 'transmission-lines', () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = outageMode ? 'crosshair' : 'pointer';
      }
    });

    map.current.on('mouseleave', 'transmission-lines', () => {
      if (map.current) map.current.getCanvas().style.cursor = '';
    });
  };

  const updateBusMarkers = () => {
    if (!map.current || !map.current.isStyleLoaded() || !buses || buses.length === 0) {
      console.log('updateBusMarkers skipped:', {
        hasMap: !!map.current,
        styleLoaded: map.current?.isStyleLoaded(),
        busesCount: buses?.length || 0
      });
      return;
    }

    console.log(`Creating markers for ${buses.length} buses`);

    // Clear existing markers
    busMarkers.current.forEach(marker => marker.remove());
    busMarkers.current = [];

    // Add new markers
    buses.forEach(bus => {
      const hasHighStress = lines
        .filter(line => line.name.includes(bus.name))
        .some(line => line.stress > 95);

      // Create marker container and inner dot (avoid overriding Mapbox transforms)
      const el = document.createElement('div');
      el.className = 'bus-marker';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      el.style.transition = 'none';

      const dot = document.createElement('div');
      const size = bus.degree >= 5 ? 12 : 8;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = getBusColor(bus.v_nom);
      dot.style.border = '2px solid rgba(0, 0, 0, 0.4)';
      dot.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      dot.style.position = 'relative';
      dot.style.transition = 'transform 0.2s';

      el.appendChild(dot);

      // Add alert badge if high stress
      if (hasHighStress) {
        const badge = document.createElement('div');
        badge.innerHTML = '⚠️';
        badge.style.position = 'absolute';
        badge.style.top = '-8px';
        badge.style.right = '-8px';
        badge.style.fontSize = '10px';
        badge.style.lineHeight = '1';
        dot.appendChild(badge);
      }

      // Hover effect on inner dot only, don't touch Mapbox transform on container
      el.addEventListener('mouseenter', () => {
        (el.firstChild as HTMLDivElement).style.transform = 'scale(1.3)';
        el.style.zIndex = '1000';
      });
      el.addEventListener('mouseleave', () => {
        (el.firstChild as HTMLDivElement).style.transform = 'scale(1)';
        el.style.zIndex = '1';
      });

      // Create popup
      const connectedLines = lines.filter(line => 
        line.name.includes(bus.name)
      );
      const avgStress = connectedLines.length > 0
        ? connectedLines.reduce((sum, l) => sum + l.stress, 0) / connectedLines.length
        : 0;

      const popup = new mapboxgl.Popup({
        offset: 15,
        closeButton: false,
        className: 'bus-popup',
      }).setHTML(`
        <div style="padding: 8px; min-width: 150px;">
          <div style="font-weight: 600; margin-bottom: 4px;">Bus: ${bus.name}</div>
          <div style="font-size: 12px; color: #888; margin-bottom: 4px;">Voltage: ${bus.v_nom} kV</div>
          <div style="font-size: 12px; color: #888; margin-bottom: 4px;">Connected lines: ${bus.degree}</div>
          <div style="font-size: 12px; color: #888;">Avg stress: ${avgStress.toFixed(1)}%</div>
        </div>
      `);

      // Create marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([bus.lon, bus.lat])
        .setPopup(popup)
        .addTo(map.current!);

      // Click handler
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onBusClick) {
          onBusClick(bus, connectedLines);
        }
      });

      busMarkers.current.push(marker);
    });

    console.log(`Created ${busMarkers.current.length} bus markers`);
  };

  useEffect(() => {
    initializeMap();

    return () => {
      busMarkers.current.forEach(marker => marker.remove());
      regionLabels.current.forEach(marker => marker.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update regions when data changes
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded() && regions.length > 0) {
      updateRegionLayers();
    }
  }, [regions, _cutRegions, showRegions, selectedRegion]);

  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      updateMapLines();
      
      // Fit map to bounds of all lines on first load (only on initial lines load)
      if (lines.length > 0 && !map.current.getSource('lines')) {
        const bounds = new mapboxgl.LngLatBounds();
        lines.forEach(line => {
          if (line.geometry && line.geometry.coordinates) {
            line.geometry.coordinates.forEach((coord: [number, number]) => {
              bounds.extend(coord);
            });
          }
        });
        
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, {
            padding: 50,
            duration: 1000,
          });
        }
      }
    }
  }, [lines, onLineClick]); // Added onLineClick dependency to recreate handlers

  useEffect(() => {
    if (map.current && buses && buses.length > 0) {
      console.log(`Bus useEffect: ${buses.length} buses, map style loaded: ${map.current.isStyleLoaded()}`);
      if (map.current.isStyleLoaded()) {
        updateBusMarkers();
      } else {
        // Wait for next style load
        const handler = () => {
          console.log('Style loaded, now adding bus markers');
          updateBusMarkers();
        };
        map.current.once('styledata', handler);
      }
    }
  }, [buses, lines]);

  // Update cursor when outage mode changes
  useEffect(() => {
    if (!map.current) return;
    const canvas = map.current.getCanvas();
    canvas.style.cursor = outageMode ? 'crosshair' : '';
  }, [outageMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg overflow-hidden" />
      <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-3 space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Line Stress</p>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: '#2FB56F' }}></div>
              <span className="text-xs text-muted-foreground">&lt;70%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: '#E0C400' }}></div>
              <span className="text-xs text-muted-foreground">70-90%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: '#FF7B00' }}></div>
              <span className="text-xs text-muted-foreground">90-100%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: '#E02F2F' }}></div>
              <span className="text-xs text-muted-foreground">&gt;100%</span>
            </div>
          </div>
        </div>
        
        <div className="border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Bus Voltage</p>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8dd3c7' }}></div>
              <span className="text-xs text-muted-foreground">≤20kV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#80b1d3' }}></div>
              <span className="text-xs text-muted-foreground">69kV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#bebada' }}></div>
              <span className="text-xs text-muted-foreground">115kV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fb8072' }}></div>
              <span className="text-xs text-muted-foreground">230kV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fdb462' }}></div>
              <span className="text-xs text-muted-foreground">&gt;230kV</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Map;
