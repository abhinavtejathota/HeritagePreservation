import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import Sidebar from "./Sidebar";
import { getApiBase } from "../lib/api";

const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 8 outer cells of a 3×3 Google Arts–style crop grid (center is the guess pad) */
const TILE_CROPS = [
  { id: "tl", pos: "0% 0%" },
  { id: "tc", pos: "50% 0%" },
  { id: "tr", pos: "100% 0%" },
  { id: "ml", pos: "0% 50%" },
  { id: "mr", pos: "100% 50%" },
  { id: "bl", pos: "0% 100%" },
  { id: "bc", pos: "50% 100%" },
  { id: "br", pos: "100% 100%" },
];

const SLOT_LAYOUT = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 1, col: 0 },
  // center reserved for controls
  { row: 1, col: 2 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
];

const HERITAGE_POOL = [
  "Schönbrunn Palace",
  "Colosseum",
  "Acropolis of Athens",
  "Stonehenge",
  "Mont-Saint-Michel",
  "Alhambra",
  "Ajanta Caves",
  "Ellora Caves",
  "Pyramids of Giza",
  "Great Temple (Petra)",
  "Al-Khazneh",
  "Forbidden City",
  "Great Wall of China",
  "Hampi Monuments",
  "Pompeii Archaeological Site",
  "Neuschwanstein Castle",
  "Chartres Cathedral",
  "Mogao Caves",
  "Potala Palace",
  "Lalibela Rock-Hewn Churches",
  "Konark Sun Temple",
  "Terracotta Army",
  "Qutb Minar",
  "Sanchi Stupa",
];

function ArtsPuzzle({ pool }) {
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [tiles, setTiles] = useState([]); // shuffled crop assignments per slot
  const [selected, setSelected] = useState(null);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState(null);
  const [moves, setMoves] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const [hintLevel, setHintLevel] = useState(0);
  const [hints, setHints] = useState([]);

  const startRound = useCallback(() => {
    const name = pool[Math.floor(Math.random() * pool.length)];
    setSite({
      name,
      image: `/sites/${toSlug(name)}.jpg`,
    });
    setTiles(shuffle(TILE_CROPS.map((c) => c.pos)));
    setSelected(null);
    setGuess("");
    setResult(null);
    setMoves(0);
    setRevealed(false);
    setHintLevel(0);
    setHints([]);
  }, [pool]);

  useEffect(() => {
    startRound();
  }, [startRound]);

  useEffect(() => {
    // Kids mode: auto first soft hint after a short delay
    if (!site || revealed) return;
    try {
      if (localStorage.getItem("vheritage_kids_mode") !== "1") return;
    } catch {
      return;
    }
    const t = setTimeout(async () => {
      try {
        const API = getApiBase();
        const res = await fetch(
          `${API}/api/ai/puzzle-hint?name=${encodeURIComponent(site.name)}&level=1`
        );
        const data = await res.json();
        setHints(data.hints || []);
        setHintLevel(1);
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [site, revealed]);

  const solvedLayout = useMemo(() => {
    // Correct crop for each slot index matching SLOT_LAYOUT order
    return TILE_CROPS.map((c) => c.pos);
  }, []);

  const isSolved = tiles.length === 8 && tiles.every((p, i) => p === solvedLayout[i]);

  const swapTiles = (i, j) => {
    if (i === j) return;
    setTiles((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setMoves((m) => m + 1);
    setSelected(null);
  };

  const onTileClick = (idx) => {
    if (revealed) return;
    if (selected === null) {
      setSelected(idx);
      return;
    }
    swapTiles(selected, idx);
  };

  const checkGuess = (e) => {
    e?.preventDefault?.();
    if (!site) return;
    const ok =
      guess.trim().toLowerCase() === site.name.toLowerCase() ||
      toSlug(guess.trim()) === toSlug(site.name);
    if (ok) {
      setResult("correct");
      setRevealed(true);
      setTimeout(() => navigate(`/sites/${toSlug(site.name)}`), 1200);
    } else {
      setResult("wrong");
    }
  };

  if (!site) return null;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-6 text-center">
        <NavLink
          to="/Explore"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 no-underline mb-5"
        >
          <span aria-hidden className="text-base leading-none">←</span>
          Back
        </NavLink>
        <p className="text-sm uppercase tracking-widest text-stone-500 mb-1">
          Arts & Culture puzzle
        </p>
        <h2 className="text-3xl md:text-4xl font-semibold text-stone-800">
          Reconstruct & guess the landmark
        </h2>
        <p className="text-stone-500 mt-2 max-w-xl mx-auto">
          Tap two tiles to swap them into place, then name the heritage site.
          Each tile shows a unique region of one photograph — no repeats.
        </p>
        <div className="flex justify-center gap-3 text-sm text-stone-600 mt-4">
          <span className="px-3 py-1 rounded-full bg-stone-100">Moves {moves}</span>
          <span className="px-3 py-1 rounded-full bg-stone-100">
            {isSolved ? "Tiles solved" : "Scrambled"}
          </span>
        </div>
      </div>

      <div
        className="relative mx-auto aspect-square w-full max-w-[720px] rounded-2xl overflow-hidden bg-stone-200 shadow-xl ring-1 ring-stone-300/60"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap: "6px",
          padding: "6px",
        }}
      >
        {SLOT_LAYOUT.map((slot, i) => (
          <motion.button
            type="button"
            key={`${slot.row}-${slot.col}`}
            layout
            onClick={() => onTileClick(i)}
            whileTap={{ scale: 0.98 }}
            className={`relative overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              selected === i ? "ring-2 ring-amber-500 scale-[0.98]" : ""
            }`}
            style={{
              gridRow: slot.row + 1,
              gridColumn: slot.col + 1,
              backgroundImage: revealed
                ? `url(${site.image})`
                : `url(${site.image})`,
              backgroundSize: revealed ? "100% 100%" : "300% 300%",
              backgroundPosition: revealed ? "center" : tiles[i],
              backgroundRepeat: "no-repeat",
            }}
            aria-label={`Puzzle tile ${i + 1}`}
          />
        ))}

        {/* Center control pad */}
        <div
          className="z-10 flex flex-col items-center justify-center gap-3 bg-white/95 backdrop-blur-sm rounded-md p-3 shadow-inner"
          style={{ gridRow: 2, gridColumn: 2 }}
        >
          <form onSubmit={checkGuess} className="w-full flex flex-col gap-2">
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Name this site…"
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-center text-sm bg-white"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 transition"
            >
              Guess
            </button>
          </form>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={async () => {
                if (!site || revealed || hintLevel >= 3) return;
                const next = hintLevel + 1;
                try {
                  const API = getApiBase();
                  const res = await fetch(
                    `${API}/api/ai/puzzle-hint?name=${encodeURIComponent(
                      site.name
                    )}&level=${next}`
                  );
                  const data = await res.json();
                  setHints(data.hints || []);
                  setHintLevel(next);
                } catch {
                  setHints(["Look at the landscape and building shape in the tiles."]);
                  setHintLevel(next);
                }
              }}
              disabled={revealed || hintLevel >= 3}
              className="flex-1 py-1.5 text-xs rounded-lg bg-amber-50 text-amber-900 hover:bg-amber-100 transition disabled:opacity-40"
            >
              Hint {hintLevel > 0 ? `(${hintLevel}/3)` : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setRevealed(true);
                setResult("revealed");
              }}
              className="flex-1 py-1.5 text-xs rounded-lg bg-stone-200 hover:bg-stone-300 transition"
            >
              Reveal
            </button>
            <button
              type="button"
              onClick={startRound}
              className="flex-1 py-1.5 text-xs rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 transition"
            >
              Next
            </button>
          </div>
          {hints.length > 0 && (
            <ul className="text-[10px] text-stone-600 text-left w-full space-y-1 px-1">
              {hints.map((h, i) => (
                <li key={i}>• {h}</li>
              ))}
            </ul>
          )}
          <AnimatePresence>
            {result === "correct" && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-emerald-600 text-xs font-semibold"
              >
                Correct
              </motion.p>
            )}
            {result === "wrong" && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-rose-600 text-xs"
              >
                Try again
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {revealed && (
        <p className="text-center mt-4 text-stone-600">
          This is <span className="font-semibold text-stone-900">{site.name}</span>
        </p>
      )}
    </div>
  );
}

export default function Play() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
    { name: "Trail", to: "/Trail" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-stone-50 via-amber-50/40 to-stone-100">
      <nav className="fixed left-0 right-0 top-0 bg-white/90 backdrop-blur text-black px-6 py-4 flex justify-between items-center shadow-sm z-[888]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex flex-col justify-between w-6 h-6"
            aria-label="Open menu"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <NavLink to="/">
            <h1 className="text-xl font-sans tracking-tight">vHeritage Archive</h1>
          </NavLink>
        </div>

        <div className="hidden md:flex gap-1">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg transition ${
                  isActive
                    ? "bg-stone-900 text-white"
                    : "hover:bg-stone-100 text-stone-700"
                }`
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

      <main className="flex-1 mt-24 px-4 md:px-8 pb-20">
        <ArtsPuzzle pool={HERITAGE_POOL} />
      </main>
    </div>
  );
}
