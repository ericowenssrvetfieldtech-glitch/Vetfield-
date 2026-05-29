import { useEffect, useRef, useState } from "react";

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
  hole: GoogleMapHole;
  shots?: ShotMarker[];
  cartPosition?: GpsPoint | null;
  height?: number;
}

declare const L: any;

export default function GoogleMapView({ hole, shots = [], cartPosition, height = 440 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holeKeyRef = useRef<string>("");

  const holeKey = `${hole.number}-${hole.tee.lat.toFixed(5)}-${hole.tee.lng.toFixed(5)}`;

  useEffect(() => {
    if (!containerRef.current) return;

    if (typeof L === "undefined") {
      setError("Map library failed to load. Check your internet connection.");
      return;
    }

    if (mapRef.current && holeKeyRef.current === holeKey) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setLoaded(false);
    }

    holeKeyRef.current = holeKey;

    try {
      const center: [number, number] = [
        (hole.tee.lat + hole.pin.lat) / 2,
        (hole.tee.lng + hole.pin.lng) / 2,
      ];

      const map = L.map(containerRef.current, {
        center,
        zoom: 18,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20,
      }).addTo(map);

      mapRef.current = map;
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load map");
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [holeKey, hole.tee.lat, hole.tee.lng, hole.pin.lat, hole.pin.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    if (hole.fairway && hole.fairway.length > 2) {
      const coords = hole.fairway.map((p: GpsPoint) => [p.lat, p.lng]);
      const poly = L.polygon(coords, {
        color: "#4CAF50",
        weight: 2,
        opacity: 0.7,
        fillColor: "#4CAF50",
        fillOpacity: 0.15,
      }).addTo(map);
      layersRef.current.push(poly);
    }

    if (hole.green && hole.green.length > 2) {
      const coords = hole.green.map((p: GpsPoint) => [p.lat, p.lng]);
      const poly = L.polygon(coords, {
        color: "#66BB6A",
        weight: 2,
        opacity: 0.9,
        fillColor: "#81C784",
        fillOpacity: 0.3,
      }).addTo(map);
      layersRef.current.push(poly);
    }

    hole.hazards?.forEach((hz) => {
      const colors: Record<string, { stroke: string; fill: string }> = {
        water: { stroke: "#1E88E5", fill: "#1E88E5" },
        bunker: { stroke: "#FDD835", fill: "#FDD835" },
        trees: { stroke: "#2E7D32", fill: "#1B5E20" },
      };
      const c = colors[hz.type] || colors.water;
      const coords = hz.pts.map((p: GpsPoint) => [p.lat, p.lng]);
      const poly = L.polygon(coords, {
        color: c.stroke,
        weight: 1.5,
        opacity: 0.8,
        fillColor: c.fill,
        fillOpacity: hz.type === "water" ? 0.3 : 0.2,
      }).addTo(map);
      layersRef.current.push(poly);
    });

    const teeIcon = L.divIcon({
      className: "",
      html: `<div style="width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid #1B3A6B;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#1B3A6B;font-family:monospace;">T</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const teeMarker = L.marker([hole.tee.lat, hole.tee.lng], { icon: teeIcon }).addTo(map);
    layersRef.current.push(teeMarker);

    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#EF4444;border:2px solid #fff;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const pinMarker = L.marker([hole.pin.lat, hole.pin.lng], { icon: pinIcon }).addTo(map);
    layersRef.current.push(pinMarker);

    if (shots.length > 0) {
      const path = shots.map(s => [s.lat, s.lng] as [number, number]);
      const trail = L.polyline(path, {
        color: shots[0]?.color || "#60A5FA",
        weight: 3,
        opacity: 0.8,
      }).addTo(map);
      layersRef.current.push(trail);

      shots.forEach((s, idx) => {
        const shotIcon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${s.color};border:1.5px solid #000;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#000;font-family:monospace;">${idx + 1}</div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([s.lat, s.lng], { icon: shotIcon }).addTo(map);
        layersRef.current.push(marker);
      });
    }

    if (cartPosition) {
      const cartIcon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#0F2444;border:2.5px solid #C8960C;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#C8960C;font-family:monospace;">C</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([cartPosition.lat, cartPosition.lng], { icon: cartIcon }).addTo(map);
      layersRef.current.push(marker);
    }

    const bounds = L.latLngBounds([
      [hole.tee.lat, hole.tee.lng],
      [hole.pin.lat, hole.pin.lng],
    ]);
    hole.fairway?.forEach(pt => bounds.extend([pt.lat, pt.lng]));
    hole.green?.forEach(pt => bounds.extend([pt.lat, pt.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
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
          MAP ERROR
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
      <div style={{
        position: "absolute", top: 8, left: 8,
        background: "rgba(0,0,0,0.75)", borderRadius: 6, padding: "8px 12px",
        fontFamily: "'IBM Plex Mono',monospace", zIndex: 1000,
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
