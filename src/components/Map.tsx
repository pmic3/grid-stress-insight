import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from './ui/button';
import { Eye, EyeOff } from 'lucide-react';

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

interface MapProps {
  lines: LineData[];
  buses: BusData[];
  onLineClick?: (line: LineData) => void;
  onBusClick?: (bus: BusData, connectedLines: any[]) => void;
  cutLines?: Set<string>;
  outageMode?: boolean;
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG1pY29uaSIsImEiOiJjbWNiMGJiMzUwOHY0MmxwejJhazhjcTd6In0.pNow26taTw3mku-wCPQCwA';

const Map = ({ lines, buses, onLineClick, onBusClick, cutLines = new Set(), outageMode = false }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const busMarkers = useRef<mapboxgl.Marker[]>([]);
  const [showRegions, setShowRegions] = useState(true);

  // Define Oʻahu regions with approximate boundaries
  const regions = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { name: 'Central Honolulu', color: 'rgba(59, 130, 246, 0.15)' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-157.95, 21.25],
            [-157.78, 21.25],
            [-157.78, 21.38],
            [-157.95, 21.38],
            [-157.95, 21.25]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { name: 'Leeward', color: 'rgba(168, 85, 247, 0.15)' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-158.22, 21.28],
            [-157.95, 21.28],
            [-157.95, 21.48],
            [-158.22, 21.48],
            [-158.22, 21.28]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { name: 'Windward', color: 'rgba(34, 197, 94, 0.15)' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-157.78, 21.25],
            [-157.65, 21.25],
            [-157.65, 21.46],
            [-157.78, 21.46],
            [-157.78, 21.25]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { name: 'North Shore', color: 'rgba(249, 115, 22, 0.15)' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-158.22, 21.53],
            [-157.88, 21.53],
            [-157.88, 21.68],
            [-158.22, 21.68],
            [-158.22, 21.53]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { name: 'Central Uplands', color: 'rgba(236, 72, 153, 0.15)' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-158.10, 21.46],
            [-157.88, 21.46],
            [-157.88, 21.58],
            [-158.10, 21.58],
            [-158.10, 21.46]
          ]]
        }
      }
    ]
  };

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
      updateMapLines();
      addRegionLayers();
      if (buses.length > 0) {
        console.log('Adding initial bus markers');
        updateBusMarkers();
      }
    });
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

  const addRegionLayers = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Add region polygons
    if (!map.current.getSource('regions')) {
      map.current.addSource('regions', {
        type: 'geojson',
        data: regions
      });

      // Add layers before transmission-lines so they appear underneath
      const beforeLayer = map.current.getLayer('transmission-lines') ? 'transmission-lines' : undefined;

      map.current.addLayer({
        id: 'region-fills',
        type: 'fill',
        source: 'regions',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': showRegions ? 1 : 0
        }
      }, beforeLayer);

      map.current.addLayer({
        id: 'region-borders',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': showRegions ? 0.3 : 0,
          'line-dasharray': [3, 2]
        }
      }, beforeLayer);

      // Add region labels
      regions.features.forEach((feature, index) => {
        const coords = feature.geometry.coordinates[0];
        const centerLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

        const el = document.createElement('div');
        el.className = 'region-label';
        el.style.cssText = `
          color: white;
          font-size: 14px;
          font-weight: 600;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 4px;
          pointer-events: none;
          white-space: nowrap;
          opacity: ${showRegions ? '1' : '0'};
          transition: opacity 0.3s;
        `;
        el.textContent = feature.properties.name;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([centerLng, centerLat])
          .addTo(map.current!);

        busMarkers.current.push(marker);
      });
    }
  };

  const toggleRegions = () => {
    setShowRegions(!showRegions);
    if (map.current && map.current.getLayer('region-fills')) {
      map.current.setPaintProperty('region-fills', 'fill-opacity', !showRegions ? 1 : 0);
      map.current.setPaintProperty('region-borders', 'line-opacity', !showRegions ? 0.3 : 0);
      
      // Update label opacity
      document.querySelectorAll('.region-label').forEach((el) => {
        (el as HTMLElement).style.opacity = !showRegions ? '1' : '0';
      });
    }
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
      map.current?.remove();
      map.current = null;
    };
  }, []);

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
      
      {/* Region Toggle Button */}
      <div className="absolute top-4 right-16 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleRegions}
          className="bg-card/90 backdrop-blur-sm"
        >
          {showRegions ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showRegions ? 'Hide' : 'Show'} Regions
        </Button>
      </div>

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
