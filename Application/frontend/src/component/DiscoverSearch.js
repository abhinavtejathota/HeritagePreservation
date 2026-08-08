import React, { useState, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import axios from "axios";
import { getApiBase } from "../lib/api";
import { toSlug } from "../lib/favourites";

/**
 * Discover: type a description → visual/text match via Clustering,
 * or upload a photo → same visual match. Results are heritage sites from our archive.
 */
export default function DiscoverSearch({ compact = false }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [heading, setHeading] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const runDiscover = async (payload) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${getApiBase()}/api/ai/discover`, payload);
      setHeading(res.data.heading || "Matches");
      setResults(res.data.results || []);
      if (!(res.data.results || []).length) {
        setError("No close matches — try another description or photo.");
      }
    } catch {
      setError("Search is taking a break. Is the app server running?");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    runDiscover({ query: query.trim(), top_k: 8 });
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      runDiscover({ image_base64: reader.result, top_k: 8 });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={compact ? "" : "w-full max-w-4xl mb-10"}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col sm:flex-row gap-2 items-stretch"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try “rock-cut temples in India” or “Gothic cathedral”…'
          className="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-sm outline-none focus:ring-2 focus:ring-amber-400/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-3 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
        >
          {loading ? "Looking…" : "Find places"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="px-4 py-3 rounded-xl border border-stone-300 text-sm hover:bg-stone-50"
        >
          Use a photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhoto}
        />
      </form>

      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      {heading && results.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">{heading}</h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {results.map((r) => (
              <NavLink
                key={r.name}
                to={`/sites/${toSlug(r.name)}`}
                className="min-w-[160px] no-underline text-stone-900"
              >
                <img
                  src={r.image_url || `/sites/${toSlug(r.name)}.jpg`}
                  alt={r.name}
                  className="h-28 w-full object-cover rounded-lg"
                  onError={(e) => {
                    e.currentTarget.src = "/sites/placeholder.jpg";
                  }}
                />
                <p className="mt-1 text-sm font-medium">{r.name}</p>
                {r.country && (
                  <p className="text-xs text-stone-500">{r.country}</p>
                )}
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            className="mt-4 text-sm text-amber-800 underline"
            onClick={() =>
              navigate("/Trail", {
                state: { start: results[0]?.name },
              })
            }
          >
            Build a visit trail from the top match →
          </button>
        </div>
      )}
    </div>
  );
}
