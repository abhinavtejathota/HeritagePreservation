import React, { useEffect, useState } from "react";
import { useParams, NavLink } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar.js";

const API_BASE = process.env.REACT_APP_API_URL;
const SIM_BASE = process.env.REACT_APP_SIM_URL;

const toSimFolder = (name) => name?.trim().replace(/\s+/g, "_");

const SIM_AVAILABLE = [
  "Blue Pillar Chapel",
  "Great Temple (Petra)",
  "The Nabataean Theatre",
  "Temple of the Winged Lions",
];

const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function Sites() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { name: slug } = useParams();
  const [site, setSite] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSim, setOpenSim] = useState(null);

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
  ];

  const randomSites = [
    { name: "Colosseum", country: "Italy" },
    { name: "Great Wall of China", country: "China" },
    { name: "Sanchi Stupa", country: "India" },
    { name: "Hampi Monuments", country: "India" },
    { name: "Great Temple (Petra)", country: "Jordan" },
    { name: "Pyramids of Giza", country: "Egypt" },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sitesRes = await axios.get(`${API_BASE}/api/sites?limit=50`);
        const allSites = sitesRes.data;

        const current = allSites.find((s) => toSlug(s.name) === slug);

        if (!current) {
          setSite(null);
          setLoading(false);
          return;
        }

        setSite(current);

        const similarRes = await axios.get(
          `${API_BASE}/api/sites/${encodeURIComponent(current.name)}/similar`
        );

        const recommendations = similarRes.data.recommendations || [];

        const similarSites = recommendations
          .map((rec) => allSites.find((s) => s.name === rec.name))
          .filter(Boolean);

        setSimilar(similarSites);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  const displaySites = similar.length > 0 ? similar : randomSites;

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700" />
      </div>
    );
  }

  if (!site) {
    return <div className="pt-32 text-center text-xl">Site not found</div>;
  }

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
      <div className="px-24 pt-24 pb-16">
        {/* Title */}
        <motion.h1
          className="text-4xl font-bold mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {site.name}
        </motion.h1>
        <p className="text-gray-500 mb-6">
          {site.country} · {site.continent} · {site.era_category} ·{" "}
          {site.religion} · {site.preservation}
        </p>
        {/* Hero image */}
        <motion.img
          src={`/sites/${toSlug(site.name)}.jpg`}
          alt={site.name}
          className="w-[720px] h-[540px] object-cover rounded-xl mb-8 mx-auto"
          onError={(e) => {
            e.currentTarget.src = "/sites/placeholder.jpg";
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        {/* Description */}
        {site.description?.split(/\n\s*\n/).map((block, index) => {
          const trimmed = block.trim();
          const headingMatch = trimmed.match(/^\*\*(.+?)\*\*(.*)$/);
          if (headingMatch) {
            const headingText = headingMatch[1]; // inside ** **
            const trailingText = headingMatch[2]?.trim(); // after ** **
            return (
              <div key={index}>
                <h3 className="text-2xl text-left font-semibold mt-10 mb-2">
                  {headingText}
                </h3>

                {trailingText && (
                  <p className="text-lg text-left leading-relaxed text-gray-700 mb-2">
                    {trailingText}
                  </p>
                )}
              </div>
            );
          }
          return (
            <p
              key={index}
              className="text-lg leading-relaxed text-gray-700 mb-6 text-left"
            >
              {trimmed}
            </p>
          );
        })}

        {SIM_AVAILABLE.includes(site.name) && (
          <button
            onClick={(e) => {
              e.preventDefault();
              console.log("Button clicked:", site.name);
              setOpenSim(openSim === site.name ? null : site.name);
            }}
            className="mt-3 px-4 py-2 bg-gray-600 text-white rounded"
          >
            {openSim === site.name ? "Hide Simulation" : "View Simulation"}
          </button>
        )}
        {/* Simulation iframe */}
        {openSim === site.name && (
          <div className="mt-4 flex flex-col items-center">
            <p className="text-sm mb-2">Click to Enter</p>
            <iframe
              src={`${SIM_BASE}/${toSimFolder(site.name)}/Buildv3/index.html`}
              title={`${site.name} Simulation`}
              className="w-[960px] h-[580px] rounded-lg border shadow-lg"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
              allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
              allowFullScreen
            />
            <p className="text-sm mb-2">Esc(2 times) to Exit</p>
          </div>
        )}

        {/* Similar sites */}
        {displaySites.length > 0 && (
          <>
            <h2 className="text-xl text-left font-semibold mt-20 mb-6">
              {similar.length > 0 ? "You may also like" : "Explore other sites"}
            </h2>

            <div className="flex gap-6 overflow-x-auto pb-4">
              {displaySites.map((s, index) => (
                <NavLink
                  key={s.name}
                  to={`/sites/${toSlug(s.name)}`}
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                  className="min-w-[240px] no-underline text-black"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <img
                      src={`/sites/${toSlug(s.name)}.jpg`}
                      alt={s.name}
                      className="h-40 w-full object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.src = "/sites/placeholder.jpg";
                      }}
                    />
                    <p className="mt-2 font-medium">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.country}</p>
                  </motion.div>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
