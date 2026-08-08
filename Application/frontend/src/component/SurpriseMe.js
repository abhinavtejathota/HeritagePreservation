import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getApiBase } from "../lib/api";
import { toSlug } from "../lib/favourites";

/** One-tap “today’s place” with a short story - full-width card, not a lonely pill */
export default function SurpriseMe({ className = "" }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const draw = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${getApiBase()}/api/ai/surprise`);
      setCard(res.data);
    } catch {
      setCard(null);
      setError("Couldn’t pick a place - is the app server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`w-full max-w-3xl mx-auto ${className}`}>
      {!card ? (
        <button
          type="button"
          onClick={draw}
          disabled={loading}
          className="group relative w-full overflow-hidden rounded-2xl text-left ring-1 ring-stone-200/80 shadow-sm
            bg-gradient-to-br from-stone-800 via-stone-700 to-amber-900
            hover:shadow-md hover:ring-stone-300 transition disabled:opacity-60"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent" />
          <div className="relative px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/90 mb-2">
                Discover
              </p>
              <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                {loading ? "Finding a place…" : "Surprise me"}
              </h3>
              <p className="mt-2 text-sm text-stone-300 max-w-md">
                Get one heritage landmark at random - with a short story to start exploring.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-stone-900 bg-white/95 px-4 py-2.5 rounded-full group-hover:bg-amber-100 transition shrink-0">
              {loading ? "…" : "Draw a place"}
              <span aria-hidden>→</span>
            </span>
          </div>
        </button>
      ) : (
        <div className="rounded-2xl overflow-hidden ring-1 ring-stone-200 bg-white shadow-sm">
          <div className="md:flex">
            <img
              src={`/sites/${toSlug(card.name)}.jpg`}
              alt={card.name}
              className="w-full md:w-56 h-44 md:h-auto object-cover"
              onError={(e) => {
                e.currentTarget.src = "/sites/placeholder.jpg";
              }}
            />
            <div className="p-5 md:p-6 flex-1 flex flex-col">
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
                {card.title || "A place for you today"}
              </p>
              <h3 className="text-xl font-semibold text-stone-900">{card.name}</h3>
              <p className="text-sm text-stone-500 mt-1">
                {[card.country, card.continent, card.era].filter(Boolean).join(" · ")}
              </p>
              {card.vibe && (
                <p className="text-xs text-amber-800 mt-2">{card.vibe}</p>
              )}
              <p className="text-sm text-stone-700 leading-relaxed mt-3 flex-1">
                {card.blurb}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="text-sm font-medium text-stone-900 underline-offset-4 hover:underline"
                  onClick={() => navigate(`/sites/${toSlug(card.name)}`)}
                >
                  Open this place →
                </button>
                <button
                  type="button"
                  onClick={draw}
                  disabled={loading}
                  className="text-sm text-stone-500 hover:text-stone-800"
                >
                  Draw another
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-rose-600 mt-2 text-center">{error}</p>}
    </div>
  );
}
