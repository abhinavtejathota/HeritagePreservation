import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "react-router-dom";
import axios from "axios";
import "./Continent.css";
import { useNavigate } from "react-router-dom";
import { NavLink } from "react-router-dom";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar.js";
import { ReactComponent as SearchIcon } from "../Dashboard/Search.svg";
import airplane from "./images/airplane.png";

import { getApiBase } from "../lib/api";

export default function Continent() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { name } = useParams();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
  ];

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setSearchLoading(true);
      try {
        const res = await axios.get(`${getApiBase()}/api/search`, {
          params: { q: query },
        });
        setSuggestions(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setSearchLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  useEffect(() => {
    const fetchSites = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${getApiBase()}/api/sites`, {
          params: {
            continent: name,
          },
        });
        setSites(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, [name]);

  /*Need to check the working*/

  if (loading)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <motion.img
          src={airplane}
          alt="Loading..."
          className="w-16 absolute"
          animate={{
            x: [-300, 0, 300],
            y: [300, 0, -300],
            rotate: [10, 25, 40],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 2.5,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      </div>
    );

  const handleSearch = () => {
    if (!query.trim()) return;
    const match = suggestions.find(
      (s) => s.name.toLowerCase() === query.toLowerCase()
    );

    if (match) {
      navigate(`/sites/${toSlug(match.name)}`);
      setQuery("");
      setSuggestions([]);
    }
  };

  const toSlug = (name) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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
      <div className="mt-24 px-24">
        <h1 className="text-4xl font-bold mb-6">{name}</h1>
        <div className="flex items-center gap-2 mb-4 p-4 bg-gray-100 rounded-lg shadow-md">
          <input
            type="text"
            placeholder="Search heritage sites..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          {searchLoading && (
            <span className="absolute right-12 flex items-center text-xs text-gray-400 space-x-2">
              <svg
                className="w-4 h-4 animate-spin text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
            </span>
          )}

          <button
            onClick={handleSearch}
            className="p-2 rounded-md hover:bg-gray-200 transition"
          >
            <SearchIcon className="w-6 h-6" />
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="relative">
            <div className="absolute left-0 right-0 text-left bg-white border rounded-md shadow-lg z-50">
              {suggestions.map((site) => (
                <NavLink
                  key={site.name}
                  to={`/sites/${toSlug(site.name)}`}
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                  }}
                  className="block px-4 py-2 text-sm hover:bg-gray-100 transition"
                >
                  <div className="font-medium">{site.name}</div>
                  <div className="text-xs text-gray-500">
                    {site.country} · {site.era_category}
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sites.map((site, index) => (
            <NavLink
              key={site.name}
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
                  <h2 className="text-xl text-left font-semibold ">
                    {site.name}
                  </h2>
                  <p className="text-md text-left text-gray-500">
                    {site.country} · {site.continent}
                  </p>
                  <p className="text-2xs text-left text-gray-500">
                    {site.era_category} · {site.architecture_style}
                  </p>
                </div>
              </motion.div>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
