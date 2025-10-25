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
  contingencyOutage?: string | null;
  contingencyIssues?: Array<{line: string; stress: number}>;
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG1pY29uaSIsImEiOiJjbWNiMGJiMzUwOHY0MmxwejJhazhjcTd6In0.pNow26taTw3mku-wCPQCwA';

const Map = ({ lines, buses, onLineClick, onBusClick, contingencyOutage, contingencyIssues }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const busMarkers = useRef<mapboxgl.Marker[]>([]);

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

  const updateMapLines = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    console.log('Updating map lines:', lines.length);
    console.log('Sample line stress values:', lines.slice(0, 3).map(l => ({ id: l.id, stress: l.stress })));

    // Remove existing layers and sources
    if (map.current.getLayer('transmission-lines')) {
      map.current.removeLayer('transmission-lines');
    }
    if (map.current.getLayer('contingency-outage-line')) {
      map.current.removeLayer('contingency-outage-line');
    }
    if (map.current.getLayer('contingency-affected-lines')) {
      map.current.removeLayer('contingency-affected-lines');
    }
    if (map.current.getSource('lines')) {
      map.current.removeSource('lines');
    }

    // Create GeoJSON from lines data
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lines.map(line => {
        const isOutage = contingencyOutage && line.name.includes(contingencyOutage);
        const isAffected = contingencyIssues?.some(issue => line.name.includes(issue.line));
        
        return {
          type: 'Feature',
          properties: {
            id: line.id,
            name: line.name,
            stress: line.stress,
            rating: line.rating,
            actual: line.actual,
            isOutage: isOutage || false,
            isAffected: isAffected || false,
          },
          geometry: line.geometry,
        };
      }),
    };

    map.current.addSource('lines', {
      type: 'geojson',
      data: geojson,
    });

    console.log('GeoJSON features with stress:', geojson.features.slice(0, 3).map(f => ({ 
      id: f.properties?.id, 
      stress: f.properties?.stress 
    })));

    // Main transmission lines layer
    map.current.addLayer({
      id: 'transmission-lines',
      type: 'line',
      source: 'lines',
      filter: ['!', ['get', 'isOutage']],
      paint: {
        'line-color': [
          'case',
          ['get', 'isAffected'],
          [
            'case',
            ['<', ['get', 'stress'], 70], '#2FB56F',
            ['<', ['get', 'stress'], 90], '#E0C400',
            ['<', ['get', 'stress'], 100], '#FF7B00',
            '#E02F2F'
          ],
          [
            'case',
            ['<', ['get', 'stress'], 70], '#2FB56F',
            ['<', ['get', 'stress'], 90], '#E0C400',
            ['<', ['get', 'stress'], 100], '#FF7B00',
            '#E02F2F'
          ]
        ],
        'line-width': [
          'case',
          ['get', 'isAffected'], 5,
          ['>', ['get', 'stress'], 100], 4,
          3
        ],
        'line-opacity': [
          'case',
          ['get', 'isAffected'], 1.0,
          0.8
        ],
      },
    });

    // Contingency outage line (gray dashed)
    map.current.addLayer({
      id: 'contingency-outage-line',
      type: 'line',
      source: 'lines',
      filter: ['get', 'isOutage'],
      paint: {
        'line-color': '#888888',
        'line-width': 4,
        'line-opacity': 0.6,
        'line-dasharray': [2, 2],
      },
    });

    // Add click handler
    map.current.on('click', 'transmission-lines', (e) => {
      if (e.features && e.features[0] && onLineClick) {
        const feature = e.features[0];
        const lineData = lines.find(l => l.id === feature.properties?.id);
        if (lineData) {
          onLineClick(lineData);
        }
      }
    });

    // Change cursor on hover
    map.current.on('mouseenter', 'transmission-lines', () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer';
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
      
      // Re-add bus markers after updating lines
      if (buses && buses.length > 0) {
        console.log('Re-adding bus markers after line update');
        updateBusMarkers();
      }
      
      // Fit map to bounds of all lines on first load
      if (lines.length > 0) {
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
  }, [lines, contingencyOutage, contingencyIssues]);

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
  }, [buses, lines, contingencyOutage, contingencyIssues]);

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
