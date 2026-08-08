import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import Sidebar from "./Sidebar";
import { getFavourites, toggleFavourite, clearFavourites, toSlug } from "../lib/favourites";
import { getApiBase } from "../lib/api";
import { NAV_LINKS } from "../lib/navLinks";

export default function Favourites() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [names, setNames] = useState(() => getFavourites());
  const [details, setDetails] = useState([]);
  const [picks, setPicks] = useState([]);
  const [pickMeta, setPickMeta] = useState(null);

  const links = NAV_LINKS;

  useEffect(() => {
    const load = async () => {
      if (!names.length) {
        setDetails([]);
        setPicks([]);
        return;
      }
      const API = getApiBase();
      try {
        const all = await axios.get(`${API}/api/sites?limit=100`);
        const map = new Map((all.data || []).map((s) => [s.name, s]));
        setDetails(names.map((n) => map.get(n) || { name: n }).filter(Boolean));

        const fy = await axios.post(`${API}/api/ai/for-you`, {
          favourites: names,
        });
        setPickMeta(fy.data);
        setPicks(fy.data.picks || []);
      } catch {
        setDetails(names.map((n) => ({ name: n })));
      }
    };
    load();
  }, [names]);

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      <nav className="fixed left-0 right-0 top-0 bg-white text-black px-6 py-4 flex justify-between items-center shadow z-50">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MenuIcon className="w-6 h-6" />
          </button>
          <a href="/">
            <h1 className="text-xl font-sans">vHeritage Archive</h1>
          </a>
        </div>
        <div className="hidden md:flex gap-4">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className="px-3 py-2 rounded hover:bg-gray-100 no-underline"
            >
              {link.name}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} links={links} />

      <div className="px-6 md:px-16 pt-28 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8 text-left">
          <div className="text-left">
            <h1 className="text-3xl font-semibold mb-2 text-left">Favourites</h1>
            <p className="text-stone-600 text-left">
              Places you saved. We also suggest what to explore next.
            </p>
          </div>
          {names.length > 0 && (
            <button
              type="button"
              className="text-sm text-stone-500 hover:text-stone-800 underline-offset-4 hover:underline"
              onClick={() => setNames(clearFavourites())}
            >
              Clear saved places
            </button>
          )}
        </div>

        {!names.length && (
          <p className="text-stone-500 mb-10 text-left">
            Nothing saved yet - open any site and tap <strong>Save</strong>.
          </p>
        )}

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-16">
          {details.map((s) => (
            <div key={s.name} className="relative">
              <NavLink
                to={`/sites/${toSlug(s.name)}`}
                className="no-underline text-stone-900"
              >
                <img
                  src={`/sites/${toSlug(s.name)}.jpg`}
                  alt={s.name}
                  className="h-40 w-full object-cover rounded-xl"
                  onError={(e) => {
                    e.currentTarget.src = "/sites/placeholder.jpg";
                  }}
                />
                <p className="mt-2 font-medium">{s.name}</p>
                <p className="text-xs text-stone-500">{s.country}</p>
              </NavLink>
              <button
                type="button"
                className="absolute top-2 right-2 bg-white/90 rounded-full px-2 py-1 text-xs"
                onClick={() => setNames(toggleFavourite(s.name))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {picks.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-1">
              {pickMeta?.title || "Picked for you"}
            </h2>
            <p className="text-sm text-stone-500 mb-6">
              {pickMeta?.subtitle || "Based on what you saved"}
            </p>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {picks.map((p) => (
                <NavLink
                  key={p.name}
                  to={`/sites/${toSlug(p.name)}`}
                  className="min-w-[180px] no-underline text-stone-900"
                >
                  <img
                    src={`/sites/${toSlug(p.name)}.jpg`}
                    alt={p.name}
                    className="h-32 w-full object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.src = "/sites/placeholder.jpg";
                    }}
                  />
                  <p className="mt-2 text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-stone-500">{p.why}</p>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
