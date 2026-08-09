import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import { getApiBase } from "../lib/api";
import { toSlug } from "../lib/favourites";

/** Mood chips come from GET /api/ai/moods (archive-driven), not a fixed frontend list. */
export default function MoodBrowse() {
  const [moods, setMoods] = useState([]);
  const [moodsLoading, setMoodsLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [title, setTitle] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMoodsLoading(true);
      try {
        const res = await axios.get(`${getApiBase()}/api/ai/moods`);
        if (!cancelled) setMoods(res.data.moods || []);
      } catch {
        if (!cancelled) setMoods([]);
      } finally {
        if (!cancelled) setMoodsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = async (id) => {
    setActive(id);
    setLoading(true);
    setError("");
    setTitle("");
    try {
      const res = await axios.get(`${getApiBase()}/api/ai/mood/${id}`);
      const list = res.data.results || [];
      setTitle(res.data.title || "");
      setResults(list);
      if (!list.length) {
        setError("No places matched this feeling in the archive yet.");
      }
    } catch {
      setResults([]);
      setError("Couldn’t load places - check that the app server is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold text-stone-800 mb-2">Browse by feeling</h2>
      <p className="text-sm text-stone-500 mb-3">
        Creative moods from the archive - each place appears under one feeling only.
      </p>
      {moodsLoading && (
        <p className="text-sm text-stone-400 mb-3">Loading moods…</p>
      )}
      {!moodsLoading && !moods.length && (
        <p className="text-sm text-stone-500 mb-3">
          No moods available yet - check that the app server can reach the database.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        {moods.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => pick(m.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              active === m.id
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white border-stone-200 text-stone-700 hover:border-stone-400"
            }`}
            title={`${m.count} place${m.count === 1 ? "" : "s"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {loading && <p className="text-sm text-stone-400">Finding places…</p>}
      {error && !loading && (
        <p className="text-sm text-stone-500 mb-3">{error}</p>
      )}
      {title && !loading && results.length > 0 && (
        <h3 className="text-sm font-medium text-stone-600 mb-3">{title}</h3>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {results.map((r) => (
          <NavLink
            key={r.name}
            to={`/sites/${toSlug(r.name)}`}
            className="min-w-[150px] no-underline text-stone-900"
          >
            <img
              src={`/sites/${toSlug(r.name)}.jpg`}
              alt={r.name}
              className="h-24 w-full object-cover rounded-lg"
              onError={(e) => {
                e.currentTarget.src = "/sites/placeholder.jpg";
              }}
            />
            <p className="mt-1 text-sm font-medium">{r.name}</p>
            <p className="text-xs text-stone-500">{r.country}</p>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
