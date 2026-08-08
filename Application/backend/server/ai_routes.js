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
  } finally {
    clearTimeout(t);
  }
}

function sharedReasons(a, b) {
  const reasons = [];
  const pairs = [
    ["country", "Same country"],
    ["continent", "Same continent"],
    ["civilization", "Same civilization"],
    ["religion", "Shared religious tradition"],
    ["architecture_style", "Similar architecture"],
    ["material", "Built with similar materials"],
    ["structure", "Similar type of structure"],
    ["era_category", "Same historical era"],
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
  return reasons;
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

/** Soft “feeling” templates — only shown if the live archive has enough matches */
const FEELING_TEMPLATES = [
  {
    id: "peaceful",
    label: "Peaceful",
    patterns: ["temple", "chapel", "monaster", "buddhist", "stupa", "garden"],
  },
  {
    id: "dramatic",
    label: "Dramatic ruins",
    patterns: ["ruin", "archaeolog", "zimbabwe", "pompeii", "carthage", "leptis"],
  },
  {
    id: "royal",
    label: "Royal & grand",
    patterns: ["palace", "castle", "forbidden", "schonbrunn", "schönbrunn", "royal"],
  },
  {
    id: "sacred",
    label: "Sacred",
    patterns: ["temple", "church", "cathedral", "mosque", "stupa", "sacred", "christian", "buddhist", "hindu", "islam"],
  },
  {
    id: "rockcut",
    label: "Carved from rock",
    patterns: ["rock-cut", "rock cut", "cave", "petra", "lalibela", "ajanta", "ellora", "grotto"],
  },
  {
    id: "wonder",
    label: "Wonder vibe",
    patterns: ["pyramid", "wall of china", "colosseum", "acropolis", "wonder"],
  },
  {
    id: "tombs",
    label: "Tombs & memorials",
    patterns: ["tomb", "mausoleum", "funerary", "necropol"],
  },
  {
    id: "fortress",
    label: "Forts & walls",
    patterns: ["fort", "wall", "castle", "citadel", "rampart"],
  },
];

const SITE_TEXT = `COALESCE(name,'') || ' ' || COALESCE(architecture_style,'') || ' ' || COALESCE(structure,'') || ' ' || COALESCE(religion,'') || ' ' || COALESCE(description,'')`;

async function countFeeling(db, patterns) {
  const ors = patterns.map((_, i) => `${SITE_TEXT} ILIKE $${i + 1}`).join(" OR ");
  const params = patterns.map((p) => `%${p}%`);
  const r = await db.query(
    `SELECT COUNT(*)::int AS c FROM heritage_sites WHERE ${ors}`,
    params
  );
  return r.rows[0]?.c || 0;
}

async function sitesForFeeling(db, patterns, limit = 12) {
  const ors = patterns.map((_, i) => `${SITE_TEXT} ILIKE $${i + 1}`).join(" OR ");
  const params = patterns.map((p) => `%${p}%`);
  params.push(limit);
  const r = await db.query(
    `SELECT name, country, continent, architecture_style, religion
     FROM heritage_sites WHERE ${ors} LIMIT $${params.length}`,
    params
  );
  return r.rows || [];
}

/**
 * Build mood chips from the live archive:
 * 1) feeling templates that match ≥2 sites
 * 2) era / religion / continent facets that appear ≥2 times
 */
async function buildDynamicMoods(db) {
  const moods = [];

  for (const t of FEELING_TEMPLATES) {
    const count = await countFeeling(db, t.patterns);
    if (count >= 2) {
      moods.push({
        id: t.id,
        label: t.label,
        count,
        kind: "feeling",
      });
    }
  }

  const facets = [
    {
      column: "era_category",
      prefix: "era",
      kind: "era",
      limit: 5,
    },
    {
      column: "religion",
      prefix: "faith",
      kind: "faith",
      limit: 5,
    },
    {
      column: "continent",
      prefix: "place",
      kind: "place",
      limit: 5,
    },
  ];

  for (const f of facets) {
    const r = await db.query(
      `SELECT TRIM(${f.column}) AS label, COUNT(*)::int AS c
       FROM heritage_sites
       WHERE ${f.column} IS NOT NULL AND TRIM(${f.column}) <> ''
       GROUP BY 1
       HAVING COUNT(*) >= 2
       ORDER BY c DESC
       LIMIT $1`,
      [f.limit]
    );
    for (const row of r.rows) {
      moods.push({
        id: `${f.prefix}-${slugifyMood(row.label)}`,
        label: row.label,
        count: row.c,
        kind: f.kind,
        column: f.column,
        value: row.label,
      });
    }
  }

  return moods;
}

async function resolveMoodQuery(db, moodId) {
  const id = String(moodId || "").toLowerCase();
  const feeling = FEELING_TEMPLATES.find((t) => t.id === id);
  if (feeling) {
    const results = await sitesForFeeling(db, feeling.patterns);
    return { id, label: feeling.label, results };
  }

  const moods = await buildDynamicMoods(db);
  const facet = moods.find((m) => m.id === id && m.column && m.value);
  if (facet) {
    const r = await db.query(
      `SELECT name, country, continent, architecture_style, religion
       FROM heritage_sites
       WHERE TRIM(${facet.column}) = $1
       ORDER BY popularity_rank DESC NULLS LAST
       LIMIT 12`,
      [facet.value]
    );
    return { id, label: facet.label, results: r.rows || [] };
  }

  return null;
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
        });
        if (r.ok && r.data.results) {
          return res.json({
            mode: "photo",
            heading: "Places that look similar",
            results: r.data.results,
          });
        }
      }
      if (query && String(query).trim()) {
        const r = await fetchJson(`${CLUSTERING_URL}/api/multimodal-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: String(query).trim(), top_k }),
        });
        if (r.ok && r.data.results) {
          return res.json({
            mode: "describe",
            heading: "Places that match your description",
            results: r.data.results,
            query: r.data.query,
          });
        }
        // DB keyword fallback
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
        const near = await db.query(
          `SELECT name FROM heritage_sites
           WHERE continent = $1 AND name <> $2 LIMIT 5`,
          [site.continent, name]
        );
        recNames = near.rows.map((r) => r.name);
      }

      const alike = [];
      for (const otherName of recNames) {
        const o = await db.query(`SELECT * FROM heritage_sites WHERE name = $1`, [otherName]);
        if (!o.rows.length) continue;
        const other = o.rows[0];
        const reasons = sharedReasons(site, other);
        alike.push({
          name: other.name,
          country: other.country,
          in_common: reasons.length
            ? reasons
            : ["Often explored together by visitors with similar interests"],
          blurb: reasons.length
            ? `Shares: ${reasons.slice(0, 3).join(" · ")}`
            : "A related stop on your heritage journey",
        });
      }

      res.json({
        site: name,
        title: "You might also like",
        subtitle: "Based on places that feel similar — not just nearby on a map",
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

  /** Visit trail: seed → diverse similar stops */
  app.post("/api/ai/trail", async (req, res) => {
    try {
      const { start, stops = 4 } = req.body || {};
      if (!start) return res.status(400).json({ message: "Choose a starting place." });
      const n = Math.min(8, Math.max(2, Number(stops) || 4));

      const trail = [start];
      const used = new Set([start]);
      let current = start;

      for (let i = 0; i < n - 1; i++) {
        let candidates = [];
        try {
          const sim = await db.query(
            `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
            [current]
          );
          candidates = (sim.rows[0]?.top_5_similar || [])
            .map((t) => t.name)
            .filter((nm) => nm && !used.has(nm));
        } catch (_) {}

        if (!candidates.length) {
          const row = await db.query(
            `SELECT continent FROM heritage_sites WHERE name = $1`,
            [current]
          );
          const cont = row.rows[0]?.continent;
          const alt = await db.query(
            `SELECT name FROM heritage_sites WHERE continent = $1 AND name <> ALL($2::text[]) LIMIT 8`,
            [cont, [...used]]
          );
          candidates = alt.rows.map((r) => r.name);
        }

        // Prefer candidates that share fewer continents with trail so far (light diversity)
        const trailContinents = new Set();
        for (const nm of trail) {
          const c = await db.query(
            `SELECT continent FROM heritage_sites WHERE name = $1`,
            [nm]
          );
          if (c.rows[0]?.continent) trailContinents.add(c.rows[0].continent);
        }

        let next = candidates[0];
        for (const c of candidates) {
          const info = await db.query(
            `SELECT continent FROM heritage_sites WHERE name = $1`,
            [c]
          );
          const cont = info.rows[0]?.continent;
          if (cont && !trailContinents.has(cont)) {
            next = c;
            break;
          }
        }
        if (!next) break;
        trail.push(next);
        used.add(next);
        current = next;
      }

      const detailed = [];
      for (let i = 0; i < trail.length; i++) {
        const r = await db.query(
          `SELECT name, country, continent FROM heritage_sites WHERE name = $1`,
          [trail[i]]
        );
        if (r.rows[0]) {
          detailed.push({
            step: i + 1,
            ...r.rows[0],
            tip:
              i === 0
                ? "Your starting point"
                : i === trail.length - 1
                  ? "Final stop on this trail"
                  : "Next stop — related in story or style",
          });
        }
      }

      res.json({
        title: "Your heritage trail",
        subtitle: "A short journey of related places — great for planning what to explore next",
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

  /** Before you go — practical tips, no jargon */
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
          body: `This place is tied to the ${s.era_category} era — useful context before you read or visit virtually.`,
        });
      }
      const continentTips = {
        Asia: "Many Asian heritage sites are best imagined in early morning light — quieter, softer photos.",
        Africa: "African heritage landscapes often reward slow looking — open space and stone textures matter.",
        Europe: "European monuments are often densest in historic city centres — plan a walking loop.",
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
          body: `If you liked this, explore ${pairWith} next — visitors with similar taste often do.`,
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
