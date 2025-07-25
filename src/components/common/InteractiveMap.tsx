"use client"; // This is a React client component

import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvent,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet"; // Only import L here, not globally in LocationManagement

// Fix for default Leaflet marker icons not showing up with Webpack/Vite
// This must be here, alongside Leaflet import
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// Map click handler for dialog
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latlng: L.LatLng) => void;
}) {
  useMapEvent("click", (e) => {
    onMapClick(e.latlng);
  });
  return null;
}

interface InteractiveMapProps {
  center: [number, number];
  zoom: number;
  scrollWheelZoom?: boolean;
  style?: React.CSSProperties; // Pass style directly
  markerPosition?: [number, number] | null;
  popupText?: string;
  onMapClick?: (latlng: L.LatLng) => void;
}

export default function InteractiveMap({
  center,
  zoom,
  scrollWheelZoom = false,
  style = { height: "100%", width: "100%" },
  markerPosition,
  popupText,
  onMapClick,
}: InteractiveMapProps) {
  // Optional: Re-center map if center prop changes (useful in dialog for edit)
  const mapRef = React.useRef<any>(null); // Use any for Leaflet map instance

  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={scrollWheelZoom}
      style={style}
      whenCreated={(map) => {
        mapRef.current = map;
      }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
      />
      {markerPosition && (
        <Marker position={markerPosition}>
          {popupText && <Popup>{popupText}</Popup>}
        </Marker>
      )}
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  );
}
