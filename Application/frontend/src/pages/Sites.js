import React, { useEffect, useState, useRef } from "react";
import { useParams, NavLink } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar.js";
import { isFavourite, toggleFavourite } from "../lib/favourites";
import { askPineAI, getKidsMode } from "../lib/prefs";
import { getApiBase } from "../lib/api";
import { NAV_LINKS } from "../lib/navLinks";

const SIM_BASE =
  import.meta.env.REACT_APP_SIM_URL ||
  (typeof window !== "undefined" ? `${window.location.origin}/sim` : "/sim");


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
  const [listenPaused, setListenPaused] = useState(false);
  const listenTextRef = useRef("");


  const links = NAV_LINKS;

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
        setAllNames(allSites.map((s) => s.name).filter((n) => n !== current.name));

        try {
          const alikeRes = await axios.get(
            `${API}/api/ai/alike/${encodeURIComponent(current.name)}`
          );
          setAlike(alikeRes.data);
        } catch {
          // Fallback: primary similarity list without blurbs
          try {
            const similarRes = await axios.get(
              `${API}/api/sites/${encodeURIComponent(current.name)}/similar?limit=5`
            );
            const recommendations = similarRes.data.recommendations || [];
            setAlike({
              title: "You might also like",
              subtitle:
                "Based on places that feel similar - not just nearby on a map",
              alike: recommendations.map((rec) => {
                const s = allSites.find((x) => x.name === rec.name);
                return {
                  name: rec.name,
                  country: s?.country || "",
                  blurb: s?.country
                    ? `Heritage landmark in ${s.country}.`
                    : "A natural next stop on a similar trail.",
                };
              }),
            });
          } catch {
            setAlike(null);
          }
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

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices?.() || [];
    const prefer = voices.find(
      (v) =>
        /en(-|_)?(GB|US|IN|AU)?/i.test(v.lang) &&
        /natural|neural|google|microsoft|samantha|daniel|aria/i.test(v.name)
    );
    return (
      prefer ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0] ||
      null
    );
  };

  const buildListenScript = () => {
    const kids = getKidsMode();
    const place = [site.country, site.continent].filter(Boolean).join(", ");
    const desc = (site.description || "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // Keep 2-3 short sentences from the dossier for a natural spoken pace
    const sentences = desc
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40)
      .slice(0, 3);
    const nextName = alike?.alike?.[0]?.name || null;
    const nextHint = alike?.alike?.[0]?.blurb || "";

    if (kids) {
      return [
        `Let's visit ${site.name}.`,
        place ? `It is in ${place}.` : "",
        site.architecture_style
          ? `Look for the ${site.architecture_style} style.`
          : "",
        sentences[0] || "",
        nextName ? `When you are done, try ${nextName} next.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `You are looking at ${site.name}${place ? `, in ${place}` : ""}.`,
      site.era_category
        ? `It belongs to the ${site.era_category} chapter of history.`
        : "",
      site.architecture_style
        ? `Visitors often notice its ${site.architecture_style}${
            site.material ? `, shaped in ${site.material}` : ""
          }.`
        : site.material
          ? `Much of what you see is crafted from ${site.material}.`
          : "",
      ...sentences,
      nextName
        ? `If this place stays with you, ${nextName} is a natural next stop${
            nextHint ? `. ${nextHint}` : "."
          }`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const startListening = () => {
    if (!("speechSynthesis" in window)) {
      alert("Voice readout uses the browser Web Speech API, which is not available here.");
      return;
    }
    window.speechSynthesis.cancel();
    const text = buildListenScript();
    listenTextRef.current = text;
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = getKidsMode() ? 0.92 : 0.96;
    u.pitch = 1;
    u.onend = () => {
      setListening(false);
      setListenPaused(false);
    };
    u.onerror = () => {
      setListening(false);
      setListenPaused(false);
    };
    setListening(true);
    setListenPaused(false);
    // Some browsers need voices loaded asynchronously
    const speak = () => window.speechSynthesis.speak(u);
    if ((window.speechSynthesis.getVoices?.() || []).length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = pickVoice();
        if (v) u.voice = v;
        speak();
      };
    } else {
      speak();
    }
  };

  const stopListening = () => {
    window.speechSynthesis?.cancel();
    setListening(false);
    setListenPaused(false);
  };

  const togglePauseListen = () => {
    if (!listening || !window.speechSynthesis) return;
    if (listenPaused) {
      window.speechSynthesis.resume();
      setListenPaused(false);
    } else {
      window.speechSynthesis.pause();
      setListenPaused(true);
    }
  };

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
                  : `Tell me about ${site.name} - architecture, history, and what makes it special.`
              )
            }
          >
            Ask about this place
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="px-4 py-2 rounded-full text-sm border border-stone-300 hover:bg-stone-50"
              onClick={() => {
                if (!listening) startListening();
                else if (listenPaused) togglePauseListen();
              }}
              title="Uses your browser Web Speech API (speechSynthesis)"
            >
              {listening ? (listenPaused ? "Resume" : "Listening…") : "Listen"}
            </button>
            {listening && (
              <>
                <button
                  type="button"
                  aria-label={listenPaused ? "Resume" : "Pause"}
                  title={listenPaused ? "Resume" : "Pause"}
                  className="w-9 h-9 rounded-md border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 flex items-center justify-center"
                  onClick={togglePauseListen}
                >
                  {listenPaused ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                      className="fill-stone-900"
                    >
                      <path d="M2.5 1.2v9.6L10.5 6 2.5 1.2z" />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                      className="fill-stone-900"
                    >
                      <rect x="2" y="1.5" width="2.5" height="9" rx="0.4" />
                      <rect x="7.5" y="1.5" width="2.5" height="9" rx="0.4" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Stop and restart from beginning"
                  title="Stop (next Listen starts from the beginning)"
                  className="w-9 h-9 rounded-md border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 flex items-center justify-center"
                  onClick={stopListening}
                >
                  <span className="w-3 h-3 bg-stone-900 rounded-[2px]" />
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-[11px] text-stone-400 mb-6 -mt-4">
          Listen uses your browser&apos;s built-in Web Speech API (not a cloud TTS).
        </p>
        {/* Before you go */}
        {visitTips?.tips?.length > 0 && (
          <div className="mb-10 p-5 rounded-2xl bg-stone-50 border border-stone-100 text-left">
            <h2 className="text-lg font-semibold mb-1 text-left">
              {visitTips.title || "Before you go"}
            </h2>
            <p className="text-sm text-stone-500 mb-4 text-left">
              Quick tips - history vibe, what to notice, and a good follow-up stop.
            </p>
            <ul className="space-y-3 text-left">
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
              setOpenSim(openSim === site.name ? null : site.name);
            }}
            className="mt-3 px-4 py-2 bg-gray-600 text-white rounded"
          >
            {openSim === site.name ? "Hide Simulation" : "View Simulation"}
          </button>
        )}
        {openSim === site.name && (
          <div className="mt-4 flex flex-col items-center">
            <p className="text-sm mb-2 text-stone-500 max-w-xl text-center">
              Unity WebGL in the browser - first load can feel heavy on free hosting
              (cold start / bandwidth). Later visits are usually smoother if the browser
              cache keeps the build.
            </p>
            <p className="text-sm mb-2">Click to Enter</p>
            <iframe
              src={`${SIM_BASE.replace(/\/$/, "")}/${encodeURIComponent(
                toSimFolder(site.name)
              ).replace(/%28/g, "(").replace(/%29/g, ")")}/Buildv3/`}
              title={`${site.name} Simulation`}
              className="w-[960px] h-[580px] rounded-lg border shadow-lg bg-stone-100"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
              allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
              allowFullScreen
              loading="eager"
            />
            <p className="text-sm mb-2">Esc (2 times) to Exit</p>
          </div>
        )}

        {/* Why similar - plain language */}
        {alike?.alike?.length > 0 && (
          <div className="mt-12 mb-8 text-left">
            <h2 className="text-xl font-semibold mb-1">
              {alike.title || "You might also like"}
            </h2>
            <p className="text-sm text-stone-500 mb-4">{alike.subtitle}</p>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {alike.alike.map((item) => (
                <NavLink
                  key={item.name}
                  to={`/sites/${toSlug(item.name)}`}
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="min-w-[200px] max-w-[220px] no-underline text-stone-900 shrink-0"
                >
                  <img
                    src={`/sites/${toSlug(item.name)}.jpg`}
                    alt={item.name}
                    className="h-36 w-full object-cover rounded-lg"
                    onError={(e) => {
                      e.currentTarget.src = "/sites/placeholder.jpg";
                    }}
                  />
                  <p className="mt-2 font-medium text-sm">{item.name}</p>
                  {item.country ? (
                    <p className="text-xs text-stone-400">{item.country}</p>
                  ) : null}
                  <p className="text-xs text-stone-500 leading-snug mt-1">{item.blurb}</p>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Compare two places */}
        <div className="mt-10 mb-8 p-4 rounded-xl bg-stone-50 border border-stone-100">
          <h2 className="text-lg font-semibold mb-2">Compare with another place</h2>
          <p className="text-sm text-stone-500 mb-3">
            See what they share - country, era, style - side by side.
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
                Tip: ask PineAI (chat) - “{compareResult.ask_pineai}”
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
          <p className="mt-8 text-sm text-gray-500">Thanks - preference recorded.</p>
        )}
      </div>
    </div>
  );
}
