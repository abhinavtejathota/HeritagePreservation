import React, { useEffect, useState } from "react";
import { useParams, NavLink } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar.js";
import { isFavourite, toggleFavourite } from "../lib/favourites";
import { askPineAI, getKidsMode } from "../lib/prefs";
import { getApiBase } from "../lib/api";

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
  const [studyPair, setStudyPair] = useState(null);
  const [studyDone, setStudyDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alike, setAlike] = useState(null);
  const [compareTo, setCompareTo] = useState("");
  const [compareResult, setCompareResult] = useState(null);
  const [allNames, setAllNames] = useState([]);
  const [visitTips, setVisitTips] = useState(null);
  const [listening, setListening] = useState(false);

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
    { name: "Trail", to: "/Trail" },
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
      const API = getApiBase();
      try {
        let current = null;
        try {
          const bySlug = await axios.get(
            `${API}/api/sites/by-slug/${encodeURIComponent(slug)}`
          );
          current = bySlug.data;
        } catch {
          const sitesRes = await axios.get(`${API}/api/sites?limit=100`);
          current = (sitesRes.data || []).find((s) => toSlug(s.name) === slug);
        }

        if (!current) {
          setSite(null);
          setLoading(false);
          return;
        }

        setSite(current);
        setSaved(isFavourite(current.name));

        const sitesRes = await axios.get(`${API}/api/sites?limit=100`);
        const allSites = sitesRes.data || [];

        const similarRes = await axios.get(
          `${API}/api/sites/${encodeURIComponent(current.name)}/similar`
        );

        const recommendations = similarRes.data.recommendations || [];

        const similarSites = recommendations
          .map((rec) => allSites.find((s) => s.name === rec.name))
          .filter(Boolean);

        setSimilar(similarSites);
        setAllNames(allSites.map((s) => s.name).filter((n) => n !== current.name));

        try {
          const alikeRes = await axios.get(
            `${API}/api/ai/alike/${encodeURIComponent(current.name)}`
          );
          setAlike(alikeRes.data);
        } catch {
          setAlike(null);
        }

        try {
          const tipsRes = await axios.get(
            `${API}/api/ai/visit-tips/${encodeURIComponent(current.name)}`
          );
          setVisitTips(tipsRes.data);
        } catch {
          setVisitTips(null);
        }

        try {
          const pairRes = await axios.get(
            `${API}/api/study/pair/${encodeURIComponent(current.name)}`
          );
          setStudyPair(pairRes.data);
          setStudyDone(false);
        } catch {
          setStudyPair(null);
        }
      } catch (err) {
        console.error(err);
        setSite(null);
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
        <p className="text-gray-500 mb-4">
          {site.country} · {site.continent} · {site.era_category} ·{" "}
          {site.religion} · {site.preservation}
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            type="button"
            onClick={() => {
              const next = toggleFavourite(site.name);
              setSaved(next.includes(site.name));
            }}
            className={`px-4 py-2 rounded-full text-sm ${
              saved ? "bg-amber-100 text-amber-900" : "bg-stone-900 text-white"
            }`}
          >
            {saved ? "Saved ♥" : "Save"}
          </button>
          <NavLink
            to="/Trail"
            state={{ start: site.name }}
            className="px-4 py-2 rounded-full text-sm border border-stone-300 no-underline text-stone-800 hover:bg-stone-50"
          >
            Start a trail from here
          </NavLink>
          <button
            type="button"
            className="px-4 py-2 rounded-full text-sm border border-stone-300 hover:bg-stone-50"
            onClick={() =>
              askPineAI(
                getKidsMode()
                  ? `Tell me about ${site.name} in simple words for kids.`
                  : `Tell me about ${site.name} — architecture, history, and what makes it special.`
              )
            }
          >
            Ask about this place
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-full text-sm border border-stone-300 hover:bg-stone-50"
            onClick={() => {
              if (!("speechSynthesis" in window)) {
                alert("Voice readout is not supported in this browser.");
                return;
              }
              window.speechSynthesis.cancel();
              if (listening) {
                setListening(false);
                return;
              }
              const tipText = (visitTips?.tips || [])
                .map((t) => `${t.title}. ${t.body}`)
                .join(" ");
              const kids = getKidsMode();
              const text = kids
                ? `${site.name} is in ${site.country || site.continent}. ${tipText || site.era_category || ""}`
                : `${site.name}. ${site.country || ""}. ${site.era_category || ""}. ${tipText || (site.description || "").replace(/\*\*/g, "").slice(0, 400)}`;
              const u = new SpeechSynthesisUtterance(text);
              u.rate = kids ? 0.95 : 1;
              u.onend = () => setListening(false);
              setListening(true);
              window.speechSynthesis.speak(u);
            }}
          >
            {listening ? "Stop listening" : "Listen"}
          </button>
        </div>
        {/* Before you go */}
        {visitTips?.tips?.length > 0 && (
          <div className="mb-10 p-5 rounded-2xl bg-stone-50 border border-stone-100">
            <h2 className="text-lg font-semibold mb-1">
              {visitTips.title || "Before you go"}
            </h2>
            <p className="text-sm text-stone-500 mb-4">
              Quick tips — history vibe, what to notice, and a good follow-up stop.
            </p>
            <ul className="space-y-3">
              {visitTips.tips.map((t) => (
                <li key={t.title}>
                  <p className="font-medium text-stone-800 text-sm">{t.title}</p>
                  <p className="text-sm text-stone-600">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

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
              src={`${SIM_BASE}/${toSimFolder(site.name)}/Buildv3/`}
              title={`${site.name} Simulation`}
              className="w-[960px] h-[580px] rounded-lg border shadow-lg"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
              allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
              allowFullScreen
            />
            <p className="text-sm mb-2">Esc(2 times) to Exit</p>
          </div>
        )}

        {/* Why similar — plain language */}
        {alike?.alike?.length > 0 && (
          <div className="mt-12 mb-8">
            <h2 className="text-xl font-semibold mb-1">
              {alike.title || "You might also like"}
            </h2>
            <p className="text-sm text-stone-500 mb-4">{alike.subtitle}</p>
            <div className="space-y-3">
              {alike.alike.map((item) => (
                <NavLink
                  key={item.name}
                  to={`/sites/${toSlug(item.name)}`}
                  className="block no-underline text-stone-900 border-b border-stone-100 pb-3 hover:bg-stone-50 px-1 rounded"
                >
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-stone-600">{item.blurb}</p>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Compare two places */}
        <div className="mt-10 mb-8 p-4 rounded-xl bg-stone-50 border border-stone-100">
          <h2 className="text-lg font-semibold mb-2">Compare with another place</h2>
          <p className="text-sm text-stone-500 mb-3">
            See what they share — country, era, style — side by side.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
              value={compareTo}
              onChange={(e) => setCompareTo(e.target.value)}
            >
              <option value="">Choose a place…</option>
              {allNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm disabled:opacity-40"
              disabled={!compareTo}
              onClick={async () => {
                try {
                  const res = await axios.post(`${getApiBase()}/api/ai/compare`, {
                    site_a: site.name,
                    site_b: compareTo,
                  });
                  setCompareResult(res.data);
                } catch {
                  setCompareResult(null);
                }
              }}
            >
              Compare
            </button>
          </div>
          {compareResult && (
            <div className="mt-4">
              <p className="text-sm text-stone-700 mb-3">{compareResult.summary}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1 pr-2"> </th>
                      <th className="py-1 pr-2">{compareResult.site_a?.name}</th>
                      <th className="py-1">{compareResult.site_b?.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(compareResult.rows || []).map((row) => (
                      <tr key={row.label} className={row.same ? "bg-amber-50/80" : ""}>
                        <td className="py-1 pr-2 font-medium">{row.label}</td>
                        <td className="py-1 pr-2">{row.a}</td>
                        <td className="py-1">{row.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-stone-500 mt-3">
                Tip: ask PineAI (chat) — “{compareResult.ask_pineai}”
              </p>
            </div>
          )}
        </div>

        {/* Preference study: model vs random */}
        {studyPair && !studyDone && (
          <div className="mt-16 border-t pt-8">
            <h2 className="text-lg font-semibold mb-2">Quick preference check</h2>
            <p className="text-sm text-gray-600 mb-4">
              Which site would you rather explore next after{" "}
              <span className="font-medium">{site.name}</span>? (research study)
            </p>
            <div className="flex flex-wrap gap-4">
              {[studyPair.option_a, studyPair.option_b].map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  className="min-w-[200px] text-left border rounded-lg p-3 hover:border-stone-800 transition"
                  onClick={async () => {
                    try {
                      await axios.post(`${getApiBase()}/api/study/preference`, {
                        query_site: studyPair.query_site,
                        option_a: studyPair.option_a.name,
                        option_b: studyPair.option_b.name,
                        chosen: opt.name,
                        condition: studyPair.condition,
                        participant_id:
                          localStorage.getItem("study_pid") ||
                          (() => {
                            const id = crypto.randomUUID();
                            localStorage.setItem("study_pid", id);
                            return id;
                          })(),
                      });
                      setStudyDone(true);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  <img
                    src={`/sites/${toSlug(opt.name)}.jpg`}
                    alt={opt.name}
                    className="h-28 w-full object-cover rounded mb-2"
                    onError={(e) => {
                      e.currentTarget.src = "/sites/placeholder.jpg";
                    }}
                  />
                  <p className="font-medium text-sm">{opt.name}</p>
                  <p className="text-xs text-gray-500">{opt.country}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        {studyDone && (
          <p className="mt-8 text-sm text-gray-500">Thanks — preference recorded.</p>
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
