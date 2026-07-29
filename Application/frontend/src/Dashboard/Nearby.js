import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import Sidebar from "./Sidebar";
import { useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function FlyToLocation({ position, zoom }) {
  const map = useMap();

  React.useEffect(() => {
    if (position) {
      map.flyTo(position, zoom, {
        duration: 1.5,
      });
    }
  }, [position, zoom, map]);

  return null;
}

const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const API_BASE = process.env.REACT_APP_API_URL;

export default function Nearby() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [nearestSite, setNearestSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchError, setSearchError] = useState("");
  const [detectedCountry, setDetectedCountry] = useState("");
  const [zoomLevel, setZoomLevel] = useState(5);

  const detectCountryFromCoords = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            "User-Agent": "vHeritageArchive/1.0",
          },
        }
      );

      const data = await res.json();
      const country = data.address?.country;

      if (country) {
        setDetectedCountry(country);

        if (
          country === "India" ||
          country === "China" ||
          country === "Jordan"
        ) {
          setZoomLevel(5);
        } else {
          setZoomLevel(6);
        }
      }
    } catch (err) {
      console.error("Country detection failed");
    }
  };

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
  ];

  useEffect(() => {
    fetch(`${API_BASE}/api/map/sites`)
      .then((res) => res.json())
      .then((data) => {
        setSites(data.sites || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Map sites fetch error", err);
        setSites([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(loc);
        detectCountryFromCoords(loc.lat, loc.lng);

        fetch(`${API_BASE}/api/map/nearest?lat=${loc.lat}&lng=${loc.lng}`)
          .then((res) => res.json())
          .then((data) => setNearestSite(data));
      },
      () => {
        setLocationDenied(true);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  const handleManualSearch = async () => {
    if (!searchText.trim()) return;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchText
        )}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "vHeritageArchive/1.0",
          },
        }
      );

      const data = await res.json();

      if (!data.length) {
        setSearchError("Location not found");
        return;
      }

      const loc = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };

      setSearchError("");
      setUserLocation(loc);
      detectCountryFromCoords(loc.lat, loc.lng);

      const nearest = await fetch(
        `${API_BASE}/api/map/nearest?lat=${loc.lat}&lng=${loc.lng}`
      );
      setNearestSite(await nearest.json());
    } catch (err) {
      setSearchError("Failed to fetch location");
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* NAVBAR */}
      <nav className="fixed left-0 right-0 top-0 bg-white px-6 py-4 flex justify-between items-center shadow z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MenuIcon className="w-6 h-6" />
          </button>
          <NavLink to="/" className="text-xl hover:opacity-80">
		     vHeritage Archive
		  </NavLink>
        </div>

        <div className="hidden md:flex gap-4">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className="px-3 py-2 rounded hover:bg-gray-100"
            >
              {link.name}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        links={links}
      />

      {locationDenied && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-white p-4 rounded shadow-md w-[90%] max-w-md">
          <p className="text-sm text-gray-600 mb-2">
            Location access denied. Enter your place manually:
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="City / Area / Country"
              className="flex-1 border px-3 py-2 rounded"
            />
            <button
              onClick={handleManualSearch}
              className="bg-black text-white px-4 py-2 rounded"
            >
              Search
            </button>
          </div>

          {searchError && (
            <p className="text-red-500 text-sm mt-2">{searchError}</p>
          )}
        </div>
      )}

      {detectedCountry && (
        <div className="absolute bottom-6 left-6 bg-white px-4 py-2 rounded shadow text-sm z-50">
          📍 You are viewing sites in <strong>{detectedCountry}</strong>
        </div>
      )}

      {/* MAP */}
      <div className="mt-20 h-[calc(100vh-5rem)]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading map…
          </div>
        ) : (
          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            minZoom={3}
            maxZoom={18}
            dragging={true}
            doubleClickZoom={false}
            worldCopyJump={true}
            style={{ zIndex: 1 }}
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* All heritage sites */}
            {sites.map((site, i) => (
              <Marker key={i} position={[site.latitude, site.longitude]}>
                <Popup>
                  <div className="flex flex-col">
					<button
						onClick={() => navigate(`/sites/${toSlug(site.name)}`)}
						className="text-blue-600 font-semibold hover:underline text-left cursor-grab"
					>
						{site.name}
					</button>
				  </div>
                </Popup>
              </Marker>
            ))}

            {userLocation && (
              <FlyToLocation
                position={[userLocation.lat, userLocation.lng]}
                zoom={zoomLevel}
              />
            )}

            {/* User location */}
            {userLocation && (
              <CircleMarker
                center={[userLocation.lat, userLocation.lng]}
                radius={10}
                pathOptions={{ color: "blue" }}
              >
                <Popup>You are here</Popup>
              </CircleMarker>
            )}

            {/* Nearest site */}
            {nearestSite && (
              <CircleMarker
                center={[nearestSite.latitude, nearestSite.longitude]}
                radius={14}
                pathOptions={{ color: "red" }}
              >
                <Popup>
                  <strong>Nearest Heritage Site</strong>
                  <br />
                  {nearestSite.name}
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
