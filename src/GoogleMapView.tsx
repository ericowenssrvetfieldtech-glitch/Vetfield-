import { useEffect, useRef, useState, useCallback } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface GoogleMapHole {
  number: number;
  par: number;
  yards: number;
  tee: GpsPoint;
  pin: GpsPoint;
  fairway?: GpsPoint[];
  green?: GpsPoint[];
  hazards?: { type: "water" | "bunker" | "trees"; pts: GpsPoint[] }[];
}

interface ShotMarker {
  lat: number;
  lng: number;
  label: string;
  color: string;
  dist?: number;
}

interface Props {
  apiKey: string;
  hole: GoogleMapHole;
  shots?: ShotMarker[];
  cartPosition?: GpsPoint | null;
  height?: number;
}

let optionsSet = false;

function ensureOptions(apiKey: string) {
  if (!optionsSet) {
    setOptions({ key: apiKey, v: "weekly" });
    optionsSet = true;
  }
}

export default function GoogleMapView({ apiKey, hole, shots = [], cartPosition, height = 440 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initMap = useCallback(async () => {
    if (!containerRef.current || !apiKey) return;

    try {
      ensureOptions(apiKey);
      await importLibrary("maps");
      await importLibrary("marker");

      const center = {
        lat: (hole.tee.lat + hole.pin.lat) / 2,
        lng: (hole.tee.lng + hole.pin.lng) / 2,
      };

      const map = new google.maps.Map(containerRef.current, {
        center,
        zoom: 18,
        mapTypeId: "satellite",
        disableDefaultUI: true,
        zoomControl: true,
        tilt: 0,
        gestureHandling: "greedy",
        styles: [
          { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
        ],
      });

      mapRef.current = map;
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Google Maps");
    }
  }, [apiKey, hole.tee.lat, hole.tee.lng, hole.pin.lat, hole.pin.lng]);

  useEffect(() => {
    initMap();
  }, [initMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    // Clear previous overlays
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];

    // Draw fairway polygon
    if (hole.fairway && hole.fairway.length > 2) {
      const fairwayPoly = new google.maps.Polygon({
        paths: hole.fairway,
        strokeColor: "#4CAF50",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillColor: "#4CAF50",
        fillOpacity: 0.15,
        map,
      });
      polygonsRef.current.push(fairwayPoly);
    }

    // Draw green polygon
    if (hole.green && hole.green.length > 2) {
      const greenPoly = new google.maps.Polygon({
        paths: hole.green,
        strokeColor: "#66BB6A",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#81C784",
        fillOpacity: 0.3,
        map,
      });
      polygonsRef.current.push(greenPoly);
    }

    // Draw hazards
    hole.hazards?.forEach(hz => {
      const colors: Record<string, { stroke: string; fill: string }> = {
        water: { stroke: "#1E88E5", fill: "#1E88E5" },
        bunker: { stroke: "#FDD835", fill: "#FDD835" },
        trees: { stroke: "#2E7D32", fill: "#1B5E20" },
      };
      const c = colors[hz.type] || colors.water;
      const poly = new google.maps.Polygon({
        paths: hz.pts,
        strokeColor: c.stroke,
        strokeOpacity: 0.8,
        strokeWeight: 1.5,
        fillColor: c.fill,
        fillOpacity: hz.type === "water" ? 0.3 : 0.2,
        map,
      });
      polygonsRef.current.push(poly);
    });

    // Tee marker
    const teeMarker = new google.maps.Marker({
      position: hole.tee,
      map,
      label: { text: "T", color: "#1B3A6B", fontWeight: "bold", fontSize: "11px" },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#FFFFFF",
        fillOpacity: 1,
        strokeColor: "#1B3A6B",
        strokeWeight: 2,
      },
    });
    markersRef.current.push(teeMarker);

    // Pin marker
    const pinMarker = new google.maps.Marker({
      position: hole.pin,
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#EF4444",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
      },
    });
    markersRef.current.push(pinMarker);

    // Shot markers and trail
    if (shots.length > 0) {
      const path = shots.map(s => ({ lat: s.lat, lng: s.lng }));
      const trail = new google.maps.Polyline({
        path,
        strokeColor: shots[0]?.color || "#60A5FA",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        geodesic: true,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillOpacity: 1 },
          offset: "50%",
        }],
        map,
      });
      polylinesRef.current.push(trail);

      shots.forEach((s, idx) => {
        const marker = new google.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          label: { text: String(idx + 1), color: "#000", fontWeight: "bold", fontSize: "9px" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: s.color,
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: 1.5,
          },
        });
        markersRef.current.push(marker);
      });
    }

    // Cart marker
    if (cartPosition) {
      const cartMarker = new google.maps.Marker({
        position: cartPosition,
        map,
        label: { text: "C", color: "#C8960C", fontWeight: "bold", fontSize: "10px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#0F2444",
          fillOpacity: 1,
          strokeColor: "#C8960C",
          strokeWeight: 2.5,
        },
      });
      markersRef.current.push(cartMarker);
    }

    // Fit bounds to show hole
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(hole.tee);
    bounds.extend(hole.pin);
    hole.fairway?.forEach(pt => bounds.extend(pt));
    hole.green?.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds, 40);
  }, [loaded, hole, shots, cartPosition]);

  if (error) {
    return (
      <div style={{
        width: "100%", height, borderRadius: 8,
        background: "rgba(0,0,0,0.8)", border: "1px solid rgba(239,68,68,0.4)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, padding: 20,
      }}>
        <div style={{ color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: 1 }}>
          GOOGLE MAPS ERROR
        </div>
        <div style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", maxWidth: 280 }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!loaded && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ color: "#C8960C", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 1.5 }}>
            LOADING SATELLITE VIEW...
          </div>
        </div>
      )}
      {/* Hole info overlay */}
      <div style={{
        position: "absolute", top: 8, left: 8,
        background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "8px 12px",
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
        <div style={{ color: "#C8960C", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          HOLE {hole.number}
        </div>
        <div style={{ color: "#fff", fontSize: 9, marginTop: 2 }}>
          PAR {hole.par} &bull; {hole.yards}Y
        </div>
      </div>
    </div>
  );
}
