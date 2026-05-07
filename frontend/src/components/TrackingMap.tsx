import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapPin } from "lucide-react";

type LocationMessage = {
  type: "location";
  latitude: number;
  longitude: number;
};

type Props = {
  orderId: string;
  destination?: {
    latitude: number;
    longitude: number;
    label?: string;
  } | null;
  initialLocation?: {
    latitude: number;
    longitude: number;
  } | null;
};

const WS_URL = (import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/api").replace(/\/$/, "");

export function TrackingMap({ orderId, destination, initialLocation }: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const driverMarker = useRef<L.CircleMarker | null>(null);
  const destinationMarker = useRef<L.CircleMarker | null>(null);
  const [lastLocation, setLastLocation] = useState<LocationMessage | null>(null);
  const destinationLatitude = destination?.latitude;
  const destinationLongitude = destination?.longitude;
  const destinationLabel = destination?.label;
  const hasDestination = destinationLatitude !== undefined && destinationLongitude !== undefined;
  const initialLatitude = initialLocation?.latitude;
  const initialLongitude = initialLocation?.longitude;

  function applyDriverLocation(location: LocationMessage) {
    setLastLocation(location);
    const point: L.LatLngTuple = [location.latitude, location.longitude];
    if (!map.current) return;
    if (!driverMarker.current) {
      driverMarker.current = L.circleMarker(point, {
        color: "#111827",
        fillColor: "#111827",
        fillOpacity: 0.9,
        radius: 8,
        weight: 2,
      }).addTo(map.current);
    } else {
      driverMarker.current.setLatLng(point);
    }
    driverMarker.current.bindPopup("Entregador");
    if (destinationLatitude !== undefined && destinationLongitude !== undefined) {
      const bounds = L.latLngBounds(point, [destinationLatitude, destinationLongitude]).pad(0.25);
      map.current.fitBounds(bounds, { maxZoom: 16 });
    } else {
      map.current.setView(point, 15);
    }
  }

  useEffect(() => {
    setLastLocation(null);
    if (driverMarker.current) {
      driverMarker.current.remove();
      driverMarker.current = null;
    }
  }, [orderId]);

  useEffect(() => {
    if (!mapElement.current || map.current) return;
    const initialPoint: L.LatLngTuple = hasDestination
      ? [destinationLatitude, destinationLongitude]
      : [-23.55052, -46.633308];
    map.current = L.map(mapElement.current).setView(initialPoint, hasDestination ? 15 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map.current);
  }, [destinationLatitude, destinationLongitude, hasDestination]);

  useEffect(() => {
    if (!map.current || destinationLatitude === undefined || destinationLongitude === undefined) return;
    const point: L.LatLngTuple = [destinationLatitude, destinationLongitude];
    if (!destinationMarker.current) {
      destinationMarker.current = L.circleMarker(point, {
        color: "#8a1f1f",
        fillColor: "#8a1f1f",
        fillOpacity: 0.85,
        radius: 9,
        weight: 2,
      }).addTo(map.current);
    } else {
      destinationMarker.current.setLatLng(point);
    }
    destinationMarker.current.bindPopup(destinationLabel ?? "Endereco de entrega");
    if (!lastLocation) {
      map.current.setView(point, 15);
    }
  }, [destinationLatitude, destinationLongitude, destinationLabel, lastLocation]);

  useEffect(() => {
    if (initialLatitude === undefined || initialLongitude === undefined) return;
    applyDriverLocation({
      type: "location",
      latitude: initialLatitude,
      longitude: initialLongitude,
    });
  }, [initialLatitude, initialLongitude, destinationLatitude, destinationLongitude]);

  useEffect(() => {
    const socket = new WebSocket(`${WS_URL}/tracking/${orderId}`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type !== "location") return;
      applyDriverLocation(payload);
    };
    return () => socket.close();
  }, [orderId, destinationLatitude, destinationLongitude]);

  return (
    <section className="tracking">
      <div className="section-title">
        <MapPin size={18} />
        <h2>Rastreio</h2>
      </div>
      <div className="map" ref={mapElement} />
      <p className="muted">
        {lastLocation
          ? `Entregador: ${lastLocation.latitude.toFixed(5)}, ${lastLocation.longitude.toFixed(5)}`
          : destination
            ? "Destino marcado. Aguardando coordenadas do entregador."
            : "Aguardando coordenadas do endereco e do entregador."}
      </p>
    </section>
  );
}
