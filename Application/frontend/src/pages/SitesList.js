import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { NavLink } from "react-router-dom";
import "./Continent.css";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "../Dashboard/Sidebar.js";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";

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

export default function SitesList() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const links = NAV_LINKS;

  // Example: /sites-list?type=era&value=Ancient
  const params = new URLSearchParams(location.search);
  const type = params.get("type"); // era, featured, country etc. -> no theme
  const value = params.get("value"); // "Ancient", "India", "Wonders", etc.
  const nameParam = params.get("name"); // for direct site name lookup (interact)
  const rank = params.get("rank");

  useEffect(() => {
    if ((!type || !value) && !nameParam) return;

    const fetchSites = async () => {
      setLoading(true);
      try {
        let url = `${getApiBase()}/api/sites?&limit=100`;
        if (nameParam) {
          navigate(`/sites/${toSlug(nameParam)}`);
          setLoading(false);
          return;
        } else if (type === "preservation_rank" || type === "popularity_rank") {
          url += `&${type}=${rank}`;
        } else {
          url += `&${type}=${encodeURIComponent(value)}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setSites(Array.isArray(data) ? data : [data]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, [type, value, nameParam, navigate, rank]);

  const formatTitle = (str) =>
    str?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const safeSites = sites.filter(
    (site) => site && typeof site.name === "string"
  );

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="fixed left-0 right-0 top-0 bg-white text-black px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex flex-col justify-between w-6 h-6"
          >
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
              className={({ isActive }) =>
                `px-3 py-2 rounded hover:bg-gray-100 no-underline hover:underline transition-colors duration-300 ease-in-out`
              }
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
      <div className="px-12 py-6 mt-20">
        <h1 className="text-3xl font-bold mb-6">{formatTitle(value)}</h1>

        {loading ? (
          <div className="fixed inset-0 flex items-center justify-center bg-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700" />
          </div>
        ) : (
          safeSites.map((site, index) => (
            <div key={site.name}>
              <NavLink
                to={`/sites/${toSlug(site.name)}`}
                className="no-underline"
              >
                <motion.div
                  key={site.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: index * 0.05,
                    duration: 0.3,
                    ease: "easeOut",
                  }}
                  className="site-row"
                >
                  <motion.img
                    src={`/sites/${toSlug(site.name)}.jpg`}
                    alt={site.name}
                    className="w-48 h-48 rounded-md object-cover flex-shrink-0"
                    loading="lazy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    onError={(e) => {
                      e.currentTarget.src = "/sites/placeholder.jpg";
                    }}
                  />

                  <div className="flex flex-col justify-center ml-8">
                    <h2 className="text-xl text-left font-semibold">
                      {site.name}
                    </h2>
                    <p className="text-left text-gray-500">
                      {site.country} · {site.continent}
                    </p>
                    <p className="text-gray-500 text-left text-sm">
                      {site.era_category} · {site.architecture_style}
                    </p>
                  </div>
                </motion.div>
              </NavLink>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
