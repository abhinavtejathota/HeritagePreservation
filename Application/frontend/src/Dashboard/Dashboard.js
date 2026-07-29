import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import axios from "axios";

import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import { ReactComponent as SearchIcon } from "./Search.svg";

import Ellora from "./images/Ellora.jpg";
import Giza from "./images/Giza.jpg";
import Colosseum from "./images/Colosseum.jpg";

import Sidebar from "./Sidebar";

const API_BASE = process.env.REACT_APP_API_URL;

/* -------------------- HELPERS -------------------- */
const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* -------------------- SITE GUESSER COMPONENT -------------------- */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const BG_POSITIONS = [
  "0% 0%",
  "50% 0%",
  "100% 0%",
  "0% 50%",
  "",
  "100% 50%",
  "0% 100%",
  "50% 100%",
  "100% 100%",
];

function SiteGuesser({ randomSites }) {
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState(null);
  const [shuffledBgPositions, setShuffledBgPositions] = useState([]);
  const containerWidth = 1250;
  const containerHeight = 750;
  const rectangleWidth = containerWidth / 3;
  const rectangleHeight = containerHeight / 3;
  const margin = 10;
  const rectangles = [
    { top: 0, left: 0 },
    { top: 0, left: rectangleWidth },
    { top: 0, left: rectangleWidth * 2 },

    { top: rectangleHeight, left: 0 },
    { top: rectangleHeight, left: rectangleWidth * 2 },

    { top: rectangleHeight * 2, left: 0 },
    { top: rectangleHeight * 2, left: rectangleWidth },
    { top: rectangleHeight * 2, left: rectangleWidth * 2 },
  ];

  const showAnswer = () => {
    if (!site) return;
    navigate(`/sites/${toSlug(site.name)}`);
  };


  useEffect(() => {
    if (!randomSites || randomSites.length === 0) return;

    const randomIndex = Math.floor(Math.random() * randomSites.length);
    const selectedSite = randomSites[randomIndex];

    setSite({
      name: selectedSite,
      image: `/sites/${toSlug(selectedSite)}.jpg`,
    });

    setShuffledBgPositions(shuffleArray(BG_POSITIONS));
    setGuess("");
    setResult(null);
  }, [randomSites]);

  const checkGuess = () => {
    if (!site) return;

    if (guess.trim().toLowerCase() === site.name.toLowerCase()) {
      setResult("correct");

      setTimeout(() => {
        navigate(`/sites/${toSlug(site.name)}`);
      }, 800);
    } else {
      setResult("wrong");
    }
  };

  if (!site) return null;

  return (
    <div
      className="relative mx-auto bg-neutral-400 p-3"
      style={{
        width: containerWidth,
        height: containerHeight,
        marginBottom: 200,
      }}
    >
      {rectangles.map((pos, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: rectangleWidth,
            height: rectangleHeight,
            top: pos.top,
            left: pos.left,
            backgroundImage: `url(${site.image})`,
            backgroundSize: "300% 300%",
            backgroundPosition: shuffledBgPositions[i] || "0% 0%",
          }}
        />
      ))}

      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          top: rectangleHeight + margin,
          left: rectangleWidth + margin,
          width: rectangleWidth - margin * 2,
          height: rectangleHeight - margin * 2,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            checkGuess();
          }}
          className="w-full flex flex-col items-center"
        >
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Guess the site..."
            className="w-full px-4 py-3 rounded-lg border shadow-md text-center text-lg bg-white text-neutral-900 placeholder-neutral-400"
          />

          <div className="mt-4 flex gap-4">
            <button
              type="submit"
              className="px-6 py-2 rounded-md bg-stone-800 text-white text-lg"
            >
              Guess
            </button>

            <button
              type="button"
              onClick={showAnswer}
              className="px-6 py-2 rounded-md bg-stone-500 text-white text-lg"
            >
              Show Answer
            </button>
          </div>
        </form>

        {result === "correct" && (
          <p className="mt-3 text-green-600 font-semibold">Correct 🎉</p>
        )}

        {result === "wrong" && <p className="mt-3 text-red-600">Try again</p>}
      </div>
    </div>
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
        const res = await axios.get(`${API_BASE}/api/search`, {
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
  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
  ];

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
      <main className="flex-1 mt-20 px-6">
        <h1 className="text-4xl py-8 font-sans mb-12">
          Which historical landmark are you keen to discover?
        </h1>

        {/* SEARCH */}
        <div className="w-full mx-auto px-24">
          <div className="relative z-50 flex items-center gap-2 p-4 bg-gray-100 rounded-lg shadow-md">
            <input
              type="text"
              placeholder="Search heritage sites..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />

            {searchLoading && (
              <span className="absolute right-12 animate-spin">⏳</span>
            )}

            <button
              onClick={handleSearch}
              className="p-2 rounded-md hover:bg-gray-200 transition"
            >
              <SearchIcon className="w-6 h-6" />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="relative z-50">
              <div className="absolute w-full mt-2 bg-white border rounded-md shadow-lg">
                {suggestions.map((site) => (
                  <NavLink
                    key={site.name}
                    to={`/sites/${toSlug(site.name)}`}
                    onClick={() => {
                      setQuery("");
                      setSuggestions([]);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100"
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
        {/* SITE GUESS */}
        <div className="mt-32 flex flex-col items-center">
          <h2 className="text-4xl font-bold mb-8">Guess the Site!</h2>
          <SiteGuesser randomSites={randomSites} />
        </div>
      </main>
    </div>
  );
}
