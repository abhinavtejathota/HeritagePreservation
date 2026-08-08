import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import axios from "axios";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar";
import { getApiBase } from "../lib/api";
import { NAV_LINKS } from "../lib/navLinks";

const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const links = NAV_LINKS;

export default function Trail() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [start, setStart] = useState(location.state?.start || "Ajanta Caves");
  const [sites, setSites] = useState([]);
  const [trail, setTrail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios
      .get(`${getApiBase()}/api/sites?limit=100`)
      .then((r) => setSites(r.data || []))
      .catch(() => {});
  }, []);

  const build = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${getApiBase()}/api/ai/trail`, {
        start,
        stops: 5,
      });
      setTrail(res.data);
    } catch {
      setTrail(null);
    } finally {
      setLoading(false);
    }
  };

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

      <div className="px-6 md:px-16 pt-28 pb-16 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-semibold text-stone-900 mb-2">Heritage trail</h1>
        <p className="text-stone-600 mb-6">
          Pick a starting place. We suggest a short path of related sites - useful for
          planning what to explore next.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <select
            className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          >
            {(sites.length ? sites : [{ name: start }]).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={build}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-stone-900 text-white text-sm hover:bg-stone-700 disabled:opacity-50"
          >
            {loading ? "Building…" : "Build my trail"}
          </button>
        </div>

        {trail && (
          <div>
            <h2 className="text-xl font-medium mb-1">{trail.title}</h2>
            <p className="text-sm text-stone-500 mb-6">{trail.subtitle}</p>
            <ol className="space-y-4">
              {(trail.stops || []).map((stop) => (
                <li key={stop.name} className="flex gap-4 items-start">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center text-sm font-semibold">
                    {stop.step}
                  </span>
                  <NavLink
                    to={`/sites/${toSlug(stop.name)}`}
                    className="flex-1 no-underline text-stone-900 hover:underline"
                  >
                    <p className="font-medium">{stop.name}</p>
                    <p className="text-xs text-stone-500">
                      {stop.country} · {stop.continent}
                    </p>
                    <p className="text-sm text-stone-600 mt-1">{stop.tip}</p>
                  </NavLink>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
