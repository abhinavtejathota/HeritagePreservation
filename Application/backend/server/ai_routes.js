/**
 * User-facing AI helpers (proxied to Clustering / DB).
 * Responses use plain language — no model names in the API payloads meant for UI.
 */
const path = require("path");
const fs = require("fs");

const CLUSTERING_URL = process.env.CLUSTERING_URL || "http://localhost:8177";

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options.timeout || 25000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: {},
      error: err?.cause?.code || err?.name || "fetch_failed",
      message: err?.message || "upstream unreachable",
    };
  } finally {
    clearTimeout(t);
  }
}

function sharedReasons(a, b) {
  const reasons = [];
  const pairs = [
    ["architecture_style", "kindred architecture"],
    ["material", "similar materials underfoot"],
    ["structure", "a related building type"],
    ["era_category", "the same historical chapter"],
    ["civilization", "a shared cultural world"],
    ["country", "the same country"],
    ["continent", "the same continent"],
    ["religion", "a related spiritual setting"],
  ];
  for (const [key, label] of pairs) {
    const va = String(a[key] || "").trim().toLowerCase();
    const vb = String(b[key] || "").trim().toLowerCase();
    if (!va || !vb || va === "nan" || vb === "nan") continue;
    if (va === vb) reasons.push(label);
    else if (
      (va.includes("rock") && vb.includes("rock")) ||
      (va.includes("gothic") && vb.includes("gothic"))
    ) {
      reasons.push(label);
    }
  }
  // Prefer distinctive reasons; avoid generic continent/country-only lists
  const weak = new Set(["the same continent", "the same country"]);
  const strong = reasons.filter((r) => !weak.has(r));
  const out = strong.length ? strong : reasons;
  return out.slice(0, 2);
}

function alikeBlurb(site, other, reasons) {
  const style = String(other.architecture_style || "").trim();
  const era = String(other.era_category || "").trim();
  const place = [other.country, other.continent].filter(Boolean).join(", ");
  if (reasons.includes("kindred architecture") && style) {
    return `Same architectural family (${style}) - a strong follow-up after ${site.name}.`;
  }
  if (reasons.includes("a shared cultural world") && other.civilization) {
    return `Also from the ${other.civilization} world${place ? ` in ${place}` : ""}.`;
  }
  if (reasons.includes("the same historical chapter") && era) {
    return `Another ${era} landmark worth pairing with this visit.`;
  }
  if (reasons.includes("similar materials underfoot") && other.material) {
    return `Built with a similar feel in ${other.material}${place ? ` · ${place}` : ""}.`;
  }
  if (reasons.length) {
    return `Why visit next: ${reasons.join("; ")}.`;
  }
  return place
    ? `A natural next stop - ${place}.`
    : "A natural follow-up stop on a similar heritage trail.";
}

function slugifyMood(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Soft creative feeling templates - no religion / continent / country chips */
const FEELING_TEMPLATES = [
  {
    id: "hushed",
    label: "Hushed and contemplative",
    patterns: ["temple", "chapel", "monaster", "stupa", "cloister", "meditation"],
  },
  {
    id: "dramatic",
    label: "Weathered drama",
    patterns: ["ruin", "archaeolog", "zimbabwe", "pompeii", "carthage", "leptis", "crumbling"],
  },
  {
    id: "royal",
    label: "Royal spectacle",
    patterns: ["palace", "castle", "forbidden", "schonbrunn", "schönbrunn", "royal", "court"],
  },
  {
    id: "rockcut",
    label: "Carved from living rock",
    patterns: ["rock-cut", "rock cut", "cave", "petra", "lalibela", "ajanta", "ellora", "grotto", "hewn"],
  },
  {
    id: "wonder",
    label: "Monumental wow",
    patterns: ["pyramid", "wall of china", "colosseum", "acropolis", "wonder", "terracotta"],
  },
  {
    id: "tombs",
    label: "Quiet memorials",
    patterns: ["tomb", "mausoleum", "funerary", "necropol", "xiaoling"],
  },
  {
    id: "fortress",
    label: "Walls and strongholds",
    patterns: ["fort", "wall", "castle", "citadel", "rampart", "bastion"],
  },
  {
    id: "canyon",
    label: "Cliff and canyon light",
    patterns: ["petra", "siq", "facade", "khazneh", "obelisk", "nabataean", "winged"],
  },
  {
    id: "skyline",
    label: "Towers against the sky",
    patterns: ["minar", "pagoda", "tower", "spire", "cathedral", "steeple"],
  },
  {
    id: "water",
    label: "Island and water edge",
    patterns: ["mont-saint", "michel", "kilwa", "harbour", "harbor", "island", "coast"],
  },
];

const SITE_TEXT = `COALESCE(name,'') || ' ' || COALESCE(architecture_style,'') || ' ' || COALESCE(structure,'') || ' ' || COALESCE(description,'')`;

async function sitesForFeeling(db, patterns, limit = 12, excludeNames = []) {
  const ors = patterns.map((_, i) => `${SITE_TEXT} ILIKE $${i + 1}`).join(" OR ");
  const params = patterns.map((p) => `%${p}%`);
  let sql = `SELECT name, country, continent, architecture_style
     FROM heritage_sites WHERE (${ors})`;
  if (excludeNames.length) {
    params.push(excludeNames);
    sql += ` AND NOT (name = ANY($${params.length}::text[]))`;
  }
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  const r = await db.query(sql, params);
  return r.rows || [];
}

/**
 * Creative mood chips only. Each site is assigned to at most one feeling
 * so Browse-by-feeling does not look like the same places repeating.
 */
async function buildDynamicMoods(db) {
  const moods = [];
  const claimed = new Set();
  const ordered = [...FEELING_TEMPLATES].sort(
    (a, b) => b.patterns.length - a.patterns.length
  );

  for (const t of ordered) {
    const results = await sitesForFeeling(db, t.patterns, 14, [...claimed]);
    if (results.length < 2) continue;
    for (const row of results) claimed.add(row.name);
    moods.push({
      id: t.id,
      label: t.label,
      count: results.length,
      kind: "feeling",
    });
  }

  moods.sort((a, b) => a.label.localeCompare(b.label));
  return moods;
}

async function resolveMoodQuery(db, moodId) {
  const id = String(moodId || "").toLowerCase();
  const feeling = FEELING_TEMPLATES.find((t) => t.id === id);
  if (!feeling) return null;

  const claimed = new Set();
  const ordered = [...FEELING_TEMPLATES].sort(
    (a, b) => b.patterns.length - a.patterns.length
  );
  for (const t of ordered) {
    const rows = await sitesForFeeling(db, t.patterns, 14, [...claimed]);
    if (rows.length < 2) continue;
    for (const row of rows) claimed.add(row.name);
    if (t.id === id) {
      return { id, label: feeling.label, results: rows };
    }
  }
  return { id, label: feeling.label, results: [] };
}

function registerAiRoutes(app, db) {
  /** Describe what you want — or upload a photo — find matching places */
  app.post("/api/ai/discover", async (req, res) => {
    try {
      const { query, image_base64, top_k = 8 } = req.body || {};
      if (image_base64) {
        const r = await fetchJson(`${CLUSTERING_URL}/api/multimodal-search-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64, top_k }),
          timeout: 60000,
        });
        if (r.ok && Array.isArray(r.data.results) && r.data.results.length) {
          return res.json({
            mode: "photo",
            heading: "Places that look similar",
            note:
              r.data.note ||
              "Strict photo match - only high-confidence archive hits are shown.",
            results: r.data.results,
          });
        }
        if (!r.ok || r.status === 0) {
          return res.status(503).json({
            message:
              "Photo search needs the Clustering service (:8177). Start it with: python scripts/start_all.py",
            clustering_url: CLUSTERING_URL,
            detail: r.message || r.error || null,
          });
        }
        return res.json({
          mode: "photo",
          heading: "Places that look similar",
          results: [],
          note: r.data?.error || "No visual matches in the archive for that photo.",
        });
      }
      if (query && String(query).trim()) {
        const r = await fetchJson(`${CLUSTERING_URL}/api/multimodal-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: String(query).trim(), top_k }),
          timeout: 60000,
        });
        if (r.ok && r.data.results) {
          return res.json({
            mode: "describe",
            heading: "Places that match your description",
            results: r.data.results,
            query: r.data.query,
          });
        }
        // DB keyword fallback when Clustering is down or empty
        const q = `%${String(query).trim()}%`;
        const result = await db.query(
          `SELECT name, country, continent, architecture_style, religion
           FROM heritage_sites
           WHERE name ILIKE $1 OR country ILIKE $1 OR civilization ILIKE $1
              OR architecture_style ILIKE $1 OR description ILIKE $1
           LIMIT $2`,
          [q, top_k]
        );
        return res.json({
          mode: "describe",
          heading: "Places that match your description",
          results: (result.rows || []).map((row) => ({
            name: row.name,
            country: row.country,
            image_url: null,
            similarity: null,
          })),
          fallback: true,
          note:
            r.status === 0
              ? "Visual/semantic search unavailable (Clustering offline) - showing keyword matches from the archive."
              : undefined,
        });
      }
      return res.status(400).json({ message: "Add a short description or a photo." });
    } catch (err) {
      console.error("discover", err);
      res.status(500).json({ message: "Discovery is unavailable right now." });
    }
  });

  /** Plain-language “what they have in common” for similar sites */
  app.get("/api/ai/alike/:name", async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const siteRes = await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [name]);
      if (!siteRes.rows.length) {
        return res.status(404).json({ message: "Site not found" });
      }
      const site = siteRes.rows[0];

      let recNames = [];
      try {
        const sim = await db.query(
          `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
          [name]
        );
        const top = sim.rows[0]?.top_5_similar || [];
        recNames = top.map((t) => t.name).filter(Boolean).slice(0, 5);
      } catch (_) {}

      if (!recNames.length) {
        // Prefer shared style / civilization over bare continent
        const near = await db.query(
          `SELECT name FROM heritage_sites
           WHERE name <> $1
             AND (
               (NULLIF(TRIM(architecture_style), '') IS NOT NULL
                 AND architecture_style = $2)
               OR (NULLIF(TRIM(civilization), '') IS NOT NULL
                 AND civilization = $3)
               OR (NULLIF(TRIM(structure), '') IS NOT NULL
                 AND structure = $4)
             )
           ORDER BY
             CASE WHEN architecture_style = $2 THEN 0 ELSE 1 END,
             CASE WHEN civilization = $3 THEN 0 ELSE 1 END
           LIMIT 5`,
          [
            name,
            site.architecture_style || "",
            site.civilization || "",
            site.structure || "",
          ]
        );
        recNames = near.rows.map((r) => r.name);
      }

      const alike = [];
      const seen = new Set();
      for (const otherName of recNames) {
        const key = String(otherName || "").trim();
        if (!key || seen.has(key.toLowerCase()) || key === name) continue;
        seen.add(key.toLowerCase());
        const o = await db.query(
          `SELECT * FROM heritage_sites WHERE TRIM(name) = TRIM($1) LIMIT 1`,
          [key]
        );
        if (!o.rows.length) continue;
        const other = o.rows[0];
        const reasons = sharedReasons(site, other);
        alike.push({
          name: other.name.trim(),
          country: other.country,
          in_common: reasons.length
            ? reasons
            : ["often paired by visitors with similar taste"],
          blurb: alikeBlurb(site, other, reasons),
        });
      }

      res.json({
        site: name,
        title: "You might also like",
        subtitle: "Based on places that feel similar - not just nearby on a map",
        alike,
      });
    } catch (err) {
      console.error("alike", err);
      res.status(500).json({ message: "Could not load related places" });
    }
  });

  /** Side-by-side compare in plain language */
  app.post("/api/ai/compare", async (req, res) => {
    try {
      const { site_a, site_b } = req.body || {};
      if (!site_a || !site_b) {
        return res.status(400).json({ message: "Pick two places to compare." });
      }
      const a = (
        await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [site_a])
      ).rows[0];
      const b = (
        await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [site_b])
      ).rows[0];
      if (!a || !b) return res.status(404).json({ message: "One of those places was not found." });

      const fields = [
        { key: "country", label: "Country" },
        { key: "continent", label: "Continent" },
        { key: "era_category", label: "Era" },
        { key: "civilization", label: "Civilization" },
        { key: "religion", label: "Religion / tradition" },
        { key: "architecture_style", label: "Architecture" },
        { key: "material", label: "Materials" },
        { key: "structure", label: "Structure" },
      ];
      const rows = fields.map((f) => ({
        label: f.label,
        a: a[f.key] || "—",
        b: b[f.key] || "—",
        same:
          String(a[f.key] || "").toLowerCase() === String(b[f.key] || "").toLowerCase() &&
          Boolean(a[f.key]),
      }));
      const inCommon = rows.filter((r) => r.same).map((r) => r.label);
      const summary =
        inCommon.length > 0
          ? `${site_a} and ${site_b} share: ${inCommon.join(", ")}.`
          : `${site_a} and ${site_b} differ across most heritage traits in our archive — interesting contrasts.`;

      res.json({
        site_a: { name: a.name, country: a.country },
        site_b: { name: b.name, country: b.country },
        summary,
        rows,
        ask_pineai: `Compare ${site_a} and ${site_b} — what do visitors usually notice?`,
      });
    } catch (err) {
      console.error("compare", err);
      res.status(500).json({ message: "Compare failed" });
    }
  });

  /** Visit trail: walk top_5_similar from the seed (same ranker as "You might also like") */
  app.post("/api/ai/trail", async (req, res) => {
    try {
      const { start, stops = 4 } = req.body || {};
      if (!start) return res.status(400).json({ message: "Choose a starting place." });
      const n = Math.min(8, Math.max(2, Number(stops) || 4));

      const trail = [start];
      const used = new Set([String(start).trim().toLowerCase()]);
      let current = start;

      for (let i = 0; i < n - 1; i++) {
        let ranked = [];
        try {
          const sim = await db.query(
            `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
            [current]
          );
          ranked = (sim.rows[0]?.top_5_similar || [])
            .filter((t) => t?.name && !used.has(String(t.name).trim().toLowerCase()))
            .sort((a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0));
        } catch (_) {}

        // If the local top-5 are exhausted, pull from unused similar of earlier stops
        if (!ranked.length) {
          for (const prev of [...trail].reverse()) {
            try {
              const sim = await db.query(
                `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
                [prev]
              );
              ranked = (sim.rows[0]?.top_5_similar || [])
                .filter(
                  (t) => t?.name && !used.has(String(t.name).trim().toLowerCase())
                )
                .sort(
                  (a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0)
                );
              if (ranked.length) break;
            } catch (_) {}
          }
        }

        if (!ranked.length) {
          // Last resort: same architecture / civilization (not bare continent)
          const row = await db.query(
            `SELECT architecture_style, civilization FROM heritage_sites WHERE name = $1`,
            [current]
          );
          const style = row.rows[0]?.architecture_style || "";
          const civ = row.rows[0]?.civilization || "";
          const alt = await db.query(
            `SELECT name FROM heritage_sites
             WHERE name <> ALL($1::text[])
               AND (
                 (NULLIF(TRIM($2), '') IS NOT NULL AND architecture_style = $2)
                 OR (NULLIF(TRIM($3), '') IS NOT NULL AND civilization = $3)
               )
             LIMIT 8`,
            [[...trail], style, civ]
          );
          ranked = alt.rows
            .filter((r) => !used.has(String(r.name).trim().toLowerCase()))
            .map((r) => ({ name: r.name, similarity: 0 }));
        }

        const next = ranked[0]?.name;
        if (!next) break;
        trail.push(next);
        used.add(String(next).trim().toLowerCase());
        current = next;
      }

      const detailed = [];
      for (let i = 0; i < trail.length; i++) {
        const r = await db.query(
          `SELECT name, country, continent, architecture_style FROM heritage_sites WHERE name = $1`,
          [trail[i]]
        );
        if (!r.rows[0]) continue;
        const stop = r.rows[0];
        let tip = "Your starting point";
        if (i > 0) {
          const prev = await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [
            trail[i - 1],
          ]);
          const reasons = prev.rows[0] ? sharedReasons(prev.rows[0], stop) : [];
          tip =
            i === trail.length - 1
              ? reasons.length
                ? `Final stop - ${reasons.join("; ")}`
                : "Final stop on this similarity path"
              : reasons.length
                ? `Next because: ${reasons.join("; ")}`
                : "Next on the similarity path from the previous stop";
        }
        detailed.push({
          step: i + 1,
          name: stop.name,
          country: stop.country,
          continent: stop.continent,
          tip,
        });
      }

      res.json({
        title: "Your heritage trail",
        subtitle:
          "Built from the same similarity rankings as You might also like - each stop follows the strongest unused match",
        stops: detailed,
      });
    } catch (err) {
      console.error("trail", err);
      res.status(500).json({ message: "Could not build a trail" });
    }
  });

  /** Personalized picks from saved favourites */
  app.post("/api/ai/for-you", async (req, res) => {
    try {
      const favourites = Array.isArray(req.body?.favourites)
        ? req.body.favourites.filter(Boolean)
        : [];
      if (!favourites.length) {
        return res.json({
          title: "Saved for later",
          subtitle: "Heart a few places, then come back for personal picks.",
          picks: [],
        });
      }

      const scores = new Map();
      for (const fav of favourites.slice(0, 12)) {
        try {
          const sim = await db.query(
            `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
            [fav]
          );
          const top = sim.rows[0]?.top_5_similar || [];
          top.forEach((t, idx) => {
            if (!t?.name || favourites.includes(t.name)) return;
            const add = (t.similarity || 0.5) + (5 - idx) * 0.05;
            scores.set(t.name, (scores.get(t.name) || 0) + add);
          });
        } catch (_) {}
      }

      const ranked = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name]) => name);

      const picks = [];
      for (const name of ranked) {
        const r = await db.query(
          `SELECT name, country, continent FROM heritage_sites WHERE name = $1`,
          [name]
        );
        if (r.rows[0]) {
          picks.push({
            ...r.rows[0],
            why: "Matches the kinds of places you saved",
          });
        }
      }

      res.json({
        title: "Picked for you",
        subtitle: "Based on places you saved — soft suggestions, not ads",
        picks,
      });
    } catch (err) {
      console.error("for-you", err);
      res.status(500).json({ message: "Could not personalize" });
    }
  });

  /** Soft puzzle hints — never reveal the name */
  app.get("/api/ai/puzzle-hint", async (req, res) => {
    try {
      const name = req.query.name;
      const level = Math.min(3, Math.max(1, parseInt(req.query.level || "1", 10)));
      if (!name) return res.status(400).json({ message: "Missing place" });

      const r = await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [name]);
      if (!r.rows.length) return res.status(404).json({ message: "Unknown place" });
      const s = r.rows[0];

      const hints = [];
      if (level >= 1) {
        hints.push(
          s.continent
            ? `This landmark is in ${s.continent}.`
            : "Think about which part of the world this silhouette suggests."
        );
      }
      if (level >= 2) {
        hints.push(
          s.structure || s.architecture_style
            ? `Look at the form: it relates to ${s.structure || s.architecture_style}.`
            : "Pay attention to the building shape and materials in the tiles."
        );
      }
      if (level >= 3) {
        hints.push(
          s.country
            ? `Visitors usually place it in ${s.country}${
                s.religion ? `, with ties to ${s.religion}` : ""
              }.`
            : "Use the surroundings in the photo tiles — landscape is a clue."
        );
      }

      res.json({
        level,
        hints,
        note: "Hints never say the place name — keep guessing!",
      });
    } catch (err) {
      console.error("hint", err);
      res.status(500).json({ message: "Hint unavailable" });
    }
  });

  /** Today's surprise place + short story blurb */
  app.get("/api/ai/surprise", async (req, res) => {
    try {
      const r = await db.query(
        `SELECT name, country, continent, era_category, religion, architecture_style, description
         FROM heritage_sites WHERE name IS NOT NULL ORDER BY RANDOM() LIMIT 1`
      );
      if (!r.rows.length) return res.status(404).json({ message: "No sites" });
      const s = r.rows[0];
      const raw = String(s.description || "").replace(/\*\*/g, "");
      const blurb =
        raw.split(/\n/).map((x) => x.trim()).filter(Boolean)[0]?.slice(0, 280) ||
        `${s.name} is a heritage landmark in ${s.country || s.continent || "the world"}.`;
      res.json({
        title: "A place for you today",
        name: s.name,
        country: s.country,
        continent: s.continent,
        era: s.era_category,
        blurb,
        vibe: [s.architecture_style, s.religion].filter(Boolean).slice(0, 2).join(" · "),
      });
    } catch (err) {
      console.error("surprise", err);
      res.status(500).json({ message: "Surprise unavailable" });
    }
  });

  /** Dynamic mood catalog — chips built from the live archive */
  app.get("/api/ai/moods", async (req, res) => {
    try {
      const moods = await buildDynamicMoods(db);
      res.json({
        moods: moods.map(({ id, label, count, kind }) => ({
          id,
          label,
          count,
          kind,
        })),
      });
    } catch (err) {
      console.error("moods list", err);
      res.status(500).json({ message: "Could not load moods" });
    }
  });

  /** Mood browse — resolve a dynamic mood id to matching sites */
  app.get("/api/ai/mood/:mood", async (req, res) => {
    const mood = String(req.params.mood || "").toLowerCase();
    try {
      const resolved = await resolveMoodQuery(db, mood);
      if (!resolved) {
        const available = await buildDynamicMoods(db);
        return res.status(400).json({
          message: "Unknown mood",
          allowed: available.map((m) => m.id),
        });
      }
      res.json({
        mood: resolved.id,
        label: resolved.label,
        title: `Places that feel “${resolved.label}”`,
        results: resolved.results,
      });
    } catch (err) {
      console.error("mood", err);
      res.status(500).json({ message: "Mood browse failed" });
    }
  });

  /** Before you go - practical tips, no jargon */
  app.get("/api/ai/visit-tips/:name", async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const r = await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [name]);
      if (!r.rows.length) return res.status(404).json({ message: "Not found" });
      const s = r.rows[0];

      const tips = [];
      if (s.era_category) {
        tips.push({
          title: "When it belongs in history",
          body: `This place is tied to the ${s.era_category} era - useful context before you read or visit virtually.`,
        });
      }
      const continentTips = {
        Asia: "Many Asian heritage sites are best imagined in early morning light - quieter, softer photos.",
        Africa: "African heritage landscapes often reward slow looking - open space and stone textures matter.",
        Europe: "European monuments are often densest in historic city centres - plan a walking loop.",
      };
      if (s.continent && continentTips[s.continent]) {
        tips.push({ title: "Atmosphere tip", body: continentTips[s.continent] });
      }

      let pairWith = null;
      try {
        const sim = await db.query(
          `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
          [name]
        );
        pairWith = (sim.rows[0]?.top_5_similar || [])[0]?.name || null;
      } catch (_) {}
      if (pairWith) {
        tips.push({
          title: "Pair with",
          body: `If you liked this, explore ${pairWith} next - visitors with similar taste often do.`,
        });
      } else if (s.country) {
        tips.push({
          title: "Same country",
          body: `Browse other places in ${s.country} for a themed mini-tour.`,
        });
      }

      if (s.architecture_style || s.material) {
        tips.push({
          title: "What to notice",
          body: `Look for ${[s.architecture_style, s.material].filter(Boolean).join(" and ")}.`,
        });
      }

      res.json({
        site: name,
        title: "Before you go",
        tips: tips.slice(0, 4),
      });
    } catch (err) {
      console.error("visit-tips", err);
      res.status(500).json({ message: "Tips unavailable" });
    }
  });
}

module.exports = { registerAiRoutes };
