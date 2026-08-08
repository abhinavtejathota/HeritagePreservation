import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import axios from "axios";

import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import { ReactComponent as SearchIcon } from "./Search.svg";

import Ellora from "./images/Ellora.jpg";
import Giza from "./images/Giza.jpg";
import Colosseum from "./images/Colosseum.jpg";

import Sidebar from "./Sidebar";
import SurpriseMe from "../component/SurpriseMe";
import { NAV_LINKS } from "../lib/navLinks";
import { getApiBase } from "../lib/api";

/* -------------------- HELPERS -------------------- */
const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* -------------------- SITE GUESSER - moved to /Play (fixed Arts puzzle) -------------------- */
function SiteGuesserTeaser() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/Play")}
      className="group relative w-full max-w-[1250px] mx-auto overflow-hidden rounded-3xl shadow-lg ring-1 ring-stone-200"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-stone-800 via-stone-700 to-amber-900" />
      <div className="relative px-8 py-16 md:py-24 text-left text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-amber-200/90 mb-3">
          Play
        </p>
        <h2 className="text-4xl md:text-5xl font-semibold mb-4 group-hover:translate-x-1 transition-transform">
          Arts &amp; Culture puzzle
        </h2>
        <p className="text-lg text-stone-200 max-w-2xl">
          Swap unique image tiles, reconstruct the landmark, and guess the
          heritage site - Google Arts–style, no repeated crops.
        </p>
        <span className="inline-block mt-8 px-5 py-2.5 rounded-full bg-white text-stone-900 text-sm font-medium group-hover:bg-amber-100 transition">
          Open puzzle →
        </span>
      </div>
    </button>
  );
}

/* -------------------- CARD COMPONENT -------------------- */
const DashboardCard = ({ continent, image, className = "", onClick }) => {
  return (
    <button onClick={onClick} className="p-2 transition">
      <div
        className={`
          w-[450px] h-[450px]
          rounded-2xl overflow-hidden relative
          shadow-md group
          transition-all duration-300
          hover:-translate-y-6 hover:shadow-xl hover:z-40
          ${className}
        `}
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
          style={{ backgroundImage: `url(${image})` }}
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex items-center justify-center text-white text-center">
          <h3 className="text-6xl font-bold">{continent}</h3>
        </div>
      </div>
    </button>
  );
};

/* -------------------- MAIN DASHBOARD -------------------- */
export default function Dashboard() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [lastOpenedSite, setLastOpenedSite] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showDice, setShowDice] = useState(false);

  /* -------------------- SEARCH -------------------- */
  const handleSearch = () => {
    if (!query.trim()) return;

    const match = suggestions.find(
      (s) => s.name.toLowerCase() === query.toLowerCase(),
    );

    if (match) {
      navigate(`/sites/${toSlug(match.name)}`);
      setQuery("");
      setSuggestions([]);
    }
  };

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

  /* -------------------- NAV LINKS -------------------- */
  const links = NAV_LINKS;

  /* -------------------- RANDOM SITES -------------------- */
  const randomSites = [
    "Schönbrunn Palace",
    "Colosseum",
    "Acropolis of Athens",
    "Stonehenge",
    "Mont-Saint-Michel",
    "Alhambra",
    "Clonmacnoise Monastic Site",
    "Leptis Magna",
    "Kilwa Kisiwani",
    "Ajanta Caves",
    "Medina of Fez",
    "Hampi Monuments",
    "Neuschwanstein Castle",
    "Chartres Cathedral",
    "Pompeii Archaeological Site",
    "Mapungubwe",
    "Great Zimbabwe Ruins",
    "Great Temple (Petra)",
    "Ellora Caves",
    "Konark Sun Temple",
    "Pattadakal",
    "Khajuraho Group of Monuments",
    "Timbuktu",
    "Carthage",
    "Tigray Rock-Hewn Churches",
    "Pyramids of Giza",
    "Chittorgarh Fort",
    "Sanchi Stupa",
    "Qutb Minar",
    "Great Living Chola Temples",
    "Lalibela Rock-Hewn Churches",
    "Temple of the Winged Lions",
    "Blue Pillar Chapel",
    "The Royal Tombs",
    "The Nabataean Theatre",
    "Obelisk Tomb & Bab as-Siq",
    "The Temenos Gate",
    "Facade Tombs",
    "Al-Khazneh",
    "Mount Tai",
    "Longmen Grottoes",
    "Ancient City of Pingyao",
    "Terracotta Army",
    "Forbidden City",
    "Mogao Caves",
    "Potala Palace",
    "Ming Xiaoling Mausoleum",
    "Great Wall of China",
    "Temple of Heaven",
  ];

  const openRandomSite = () => {
    if (isShaking || randomSites.length === 0) return;

    let randomSite;
    do {
      randomSite = randomSites[Math.floor(Math.random() * randomSites.length)];
    } while (randomSite === lastOpenedSite && randomSites.length > 1);

    setShowDice(true);
    setIsShaking(true);

    setTimeout(() => {
      setIsShaking(false);
      setShowDice(false);
      setLastOpenedSite(randomSite);
      navigate(`/sites/${toSlug(randomSite)}`);
    }, 1200);
  };

  /* -------------------- JSX -------------------- */
  return (
    <div className="flex flex-col min-h-screen">
      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 bg-white px-6 py-4 flex justify-between items-center shadow z-[888]">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MenuIcon className="w-6 h-6" />
          </button>

          <NavLink to="/">
            <h1 className="text-xl font-sans">vHeritage Archive</h1>
          </NavLink>
        </div>

        <div className="hidden md:flex gap-4">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className="px-3 py-2 rounded hover:bg-gray-100 hover:underline transition"
            >
              {link.name}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* SIDEBAR */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        links={links}
      />

      {/* MAIN */}
      <main className="flex-1 mt-20 px-6 pb-16">
        <h1 className="text-4xl md:text-5xl py-8 font-sans mb-8 tracking-tight text-stone-900">
          Which historical landmark are you keen to discover?
        </h1>

        {/* SEARCH */}
        <div className="w-full mx-auto px-4 md:px-24">
          <div className="relative z-50 flex items-center gap-2 p-3 md:p-4 bg-stone-100/90 backdrop-blur rounded-2xl shadow-sm ring-1 ring-stone-200/80">
            <input
              type="text"
              placeholder="Search heritage sites..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full px-3 py-2.5 border-0 bg-white rounded-xl text-sm shadow-inner focus:ring-2 focus:ring-amber-400/50 outline-none"
            />

            {searchLoading && (
              <span className="absolute right-14 text-stone-400 animate-pulse text-xs">
                …
              </span>
            )}

            <button
              onClick={handleSearch}
              className="p-2.5 rounded-xl hover:bg-white transition"
              aria-label="Search"
            >
              <SearchIcon className="w-6 h-6" />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="relative z-50">
              <div className="absolute w-full mt-2 bg-white border border-stone-100 rounded-xl shadow-xl overflow-hidden">
                {suggestions.map((site) => (
                  <NavLink
                    key={site.name}
                    to={`/sites/${toSlug(site.name)}`}
                    onClick={() => {
                      setQuery("");
                      setSuggestions([]);
                    }}
                    className="block px-4 py-3 hover:bg-amber-50/80 transition border-b border-stone-50 last:border-0"
                  >
                    <div className="font-medium text-stone-800">{site.name}</div>
                    <div className="text-xs text-stone-500">
                      {site.country} · {site.era_category}
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <SurpriseMe />
        </div>

        {/* CONTINENT CARDS */}
        <div className="flex mt-24 justify-center relative">
          <DashboardCard
            continent="Asia"
            image={Ellora}
            onClick={() => navigate("/continent/Asia")}
          />
          <DashboardCard
            continent="Africa"
            image={Giza}
            className="-ml-16"
            onClick={() => navigate("/continent/Africa")}
          />
          <DashboardCard
            continent="Europe"
            image={Colosseum}
            className="-ml-16"
            onClick={() => navigate("/continent/Europe")}
          />
        </div>

        {/* RANDOM SITE */}
        <div className="mt-32 flex justify-center">
          <button onClick={openRandomSite}>
            <div
              className={`
                w-[1250px] h-[550px]
                rounded-3xl overflow-hidden relative
                transition-all duration-300
                flex items-center justify-center
                group
                ${!showDice ? "shadow-lg hover:-translate-y-3 hover:shadow-2xl" : ""}
                ${showDice ? "scale-95 opacity-90" : "scale-100 opacity-100"}
              `}
            >
              {!showDice ? (
                <>
                  {/* CARD VIEW */}
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-200 via-orange-300 to-orange-400 transition-opacity duration-300 group-hover:opacity-0" />
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-yellow-100 to-orange-200 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-white/40" />

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-600 text-center">
                    <h2 className="text-5xl font-bold mb-3">
                      🎲 Random Heritage Adventure
                    </h2>
                    <p className="text-lg opacity-90">
                      Click to roll the dice and explore a surprise site
                    </p>

                    {lastOpenedSite && (
                      <p className="mt-4 text-sm opacity-70">
                        Last discovered: {lastOpenedSite}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div
                  className={`
                    w-32 h-32
                    bg-white text-black
                    rounded-xl
                    flex items-center justify-center
                    text-6xl font-bold
                    ${isShaking ? "animate-dice" : ""}
                  `}
                >
                  🎲
                </div>
              )}
            </div>
          </button>
        </div>
        {/* SITE GUESS - full puzzle lives on /Play */}
        <div className="mt-28 mb-24 flex flex-col items-center px-2">
          <SiteGuesserTeaser />
        </div>
      </main>
    </div>
  );
}
