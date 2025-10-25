import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface LineData {
  id: string;
  name: string;
  geometry: any;
  stress: number;
  rating: number;
  actual: number;
}

interface MapProps {
  lines: LineData[];
  onLineClick?: (line: LineData) => void;
}

const Map = ({ lines, onLineClick }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [isTokenSet, setIsTokenSet] = useState(false);

  const initializeMap = (token: string) => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = token;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-157.8, 21.3], // Hawaii coordinates
      zoom: 8,
      pitch: 0,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      updateMapLines();
    });
  };

  const getLineColor = (stress: number) => {
    if (stress < 70) return '#2FB56F';
    if (stress < 90) return '#E0C400';
    if (stress < 100) return '#FF7B00';
    return '#E02F2F';
  };

  const updateMapLines = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Remove existing layers and sources
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
        },
        geometry: line.geometry,
      })),
    };

    map.current.addSource('lines', {
      type: 'geojson',
      data: geojson,
    });

    map.current.addLayer({
      id: 'transmission-lines',
      type: 'line',
      source: 'lines',
      paint: {
        'line-color': [
          'case',
          ['<', ['get', 'stress'], 70], '#2FB56F',
          ['<', ['get', 'stress'], 90], '#E0C400',
          ['<', ['get', 'stress'], 100], '#FF7B00',
          '#E02F2F'
        ],
        'line-width': [
          'case',
          ['>', ['get', 'stress'], 100], 4,
          3
        ],
        'line-opacity': 0.8,
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

  useEffect(() => {
    if (isTokenSet && mapboxToken) {
      initializeMap(mapboxToken);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isTokenSet, mapboxToken]);

  useEffect(() => {
    if (map.current && isTokenSet) {
      updateMapLines();
      
      // Fit map to bounds of all lines
      if (lines.length > 0 && map.current.isStyleLoaded()) {
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
  }, [lines, isTokenSet]);

  const handleSetToken = () => {
    if (tokenInput.trim()) {
      setMapboxToken(tokenInput);
      setIsTokenSet(true);
    }
  };

  if (!isTokenSet) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-card border border-border rounded-lg">
        <div className="max-w-md p-8 space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-foreground">Mapbox Token Required</h3>
            <p className="text-sm text-muted-foreground">
              To display the transmission line map, please enter your Mapbox public token.
              Get one at <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">mapbox.com</a>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapbox-token">Mapbox Public Token</Label>
            <Input
              id="mapbox-token"
              type="text"
              placeholder="pk.eyJ1..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetToken()}
            />
          </div>
          <Button onClick={handleSetToken} className="w-full">
            Initialize Map
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg overflow-hidden" />
      <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded" style={{ backgroundColor: '#2FB56F' }}></div>
            <span className="text-muted-foreground">&lt;70%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded" style={{ backgroundColor: '#E0C400' }}></div>
            <span className="text-muted-foreground">70-90%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded" style={{ backgroundColor: '#FF7B00' }}></div>
            <span className="text-muted-foreground">90-100%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded" style={{ backgroundColor: '#E02F2F' }}></div>
            <span className="text-muted-foreground">&gt;100%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Map;
