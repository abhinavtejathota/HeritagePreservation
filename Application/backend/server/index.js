// import ./db for connection
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./db");
const { registerAiRoutes } = require("./ai_routes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Serve React production build from the same origin (one-command Application start)
const FRONTEND_BUILD = path.join(__dirname, "../../frontend/build");
const SERVE_FRONTEND = fs.existsSync(path.join(FRONTEND_BUILD, "index.html"));
if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_BUILD));
  console.log(`Serving frontend from ${FRONTEND_BUILD}`);
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    frontend_served: SERVE_FRONTEND,
  });
});

/** Lightweight recommendation preference study (model vs random). JSONL log. */
const STUDY_LOG = path.join(__dirname, "data", "study_events.jsonl");
function appendStudyEvent(ev) {
  const dir = path.dirname(STUDY_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(STUDY_LOG, JSON.stringify({ ...ev, ts: Date.now() }) + "\n");
}

app.post("/api/study/preference", async (req, res) => {
  try {
    const {
      query_site,
      option_a,
      option_b,
      chosen,
      condition, // "model" | "random" — which side was model-ranked first pair source
      participant_id,
    } = req.body || {};
    if (!query_site || !option_a || !option_b || !chosen) {
      return res.status(400).json({ message: "query_site, option_a, option_b, chosen required" });
    }
    if (![option_a, option_b].includes(chosen)) {
      return res.status(400).json({ message: "chosen must be option_a or option_b name" });
    }
    const row = {
      query_site,
      option_a,
      option_b,
      chosen,
      condition: condition || "model_vs_random",
      participant_id: participant_id || null,
      chose_a: chosen === option_a,
    };
    appendStudyEvent(row);
    res.status(201).json({ ok: true, logged: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to log preference" });
  }
});

app.get("/api/study/summary", (req, res) => {
  try {
    if (!fs.existsSync(STUDY_LOG)) {
      return res.json({ n: 0, prefer_a_rate: null, events: [] });
    }
    const lines = fs
      .readFileSync(STUDY_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const n = lines.length;
    const preferA = lines.filter((e) => e.chose_a).length;
    res.json({
      n,
      prefer_a_rate: n ? preferA / n : null,
      note: "A is typically model recommendation; B random distractor when UI sets condition.",
      events: lines.slice(-50),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/study/pair/:name", async (req, res) => {
  /** Returns one model recommendation + one random other site for A/B preference. */
  const name = decodeURIComponent(req.params.name);
  try {
    const sitesRes = await db.query(
      `SELECT name, country FROM heritage_sites WHERE name IS NOT NULL`
    );
    const all = sitesRes.rows || [];
    const others = all.filter((s) => s.name !== name);
    if (others.length < 2) {
      return res.status(404).json({ message: "Not enough sites" });
    }

    let modelPick = null;
    try {
      const sim = await db.query(
        `SELECT top_5_similar FROM site_similarity WHERE site_name = $1`,
        [name]
      );
      const top = sim.rows[0]?.top_5_similar || [];
      if (Array.isArray(top) && top[0]?.name) {
        modelPick = others.find((s) => s.name === top[0].name) || { name: top[0].name };
      }
    } catch (_) {
      /* ignore */
    }
    if (!modelPick) {
      modelPick = others[Math.floor(Math.random() * others.length)];
    }
    let randomPick = others[Math.floor(Math.random() * others.length)];
    let guard = 0;
    while (randomPick.name === modelPick.name && guard++ < 20) {
      randomPick = others[Math.floor(Math.random() * others.length)];
    }

    // Randomize left/right presentation
    const swap = Math.random() < 0.5;
    const option_a = swap ? randomPick : modelPick;
    const option_b = swap ? modelPick : randomPick;
    res.json({
      query_site: name,
      option_a: { name: option_a.name, country: option_a.country },
      option_b: { name: option_b.name, country: option_b.country },
      model_is: swap ? "b" : "a",
      condition: "model_vs_random",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to build study pair" });
  }
});

registerAiRoutes(app, db);

// Dev-only plaintext health when frontend build is absent
if (!SERVE_FRONTEND) {
  app.get("/", (req, res) => {
    res.send("Backend is running! (frontend build not found)");
  });
}

const PRESERVATION_MAP = {
  5: "Excellent",
  4: "Good",
  3: "Moderate",
  2: "Partially ruined, preserved",
  1: "Ruins preserved",
};

const POPULARITY_MAP = {
  6: "Very High",
  5: "High",
  4: "Moderate-High",
  3: "Moderate",
  2: "Low-Moderate",
  1: "Low",
};

const THEME_COLUMN_MAP = {
  architecture: "architecture_style",
  era_category: "era_category",
  civilization: "civilization",
  continent: "continent",
  religion: "religion",
  material: "material",
  structure: "structure",
  popularity_rank: "popularity_rank",
  preservation_rank: "preservation_rank",
};

const MULTI_VALUE_COLUMNS = [
  "religion",
  "civilization",
  "architecture_style",
  "material",
  "structure",
];

const FEATURED_MAPPINGS = {
  wonders_of_the_world: ["Pyramids of Giza", "Great Wall of China"],

  sacred_spaces: [
    "Clonmacnoise Monastic Site",
    "Chartres Cathedral",
    "Sanchi Stupa",
    "Ajanta Caves",
    "Ellora Caves",
    "Konark Sun Temple",
    "Pattadakal",
    "Khajuraho Group of Monuments",
    "Great Living Chola Temples",
    "Lalibela Rock-Hewn Churches",
    "Tigray Rock-Hewn Churches",
    "Mogao Caves",
    "Potala Palace",
  ],

  lost_cities: [
    "Pompeii Archaeological Site",
    "Carthage",
    "Leptis Magna",
    "Kilwa Kisiwani",
    "Mapungubwe",
    "Great Zimbabwe Ruins",
    "Hampi Monuments",
  ],
};

/*
GET /api/sites?{type}=${text} → filtered list (cards, explore) //done
GET /api/sites/:name → full site details //done
GET /api/search?q= → search bar suggestions //done
GET /api/sites/:name/similar → recommendations (eg.) GET /api/sites/Great%20Temple%20(Petra)/similar) //done

creating mappings for 
GET /api/sites?featured=wonders
GET /api/sites?featured=sacred
GET /api/sites?featured=lost -> Featured mappings //done

GET /api/sites?era=Ancient and so on -> Era mappings (might edit in database to have consistent naming) //done
-> added GET /api/themes/:type to get distinct values for themes and then ->
GET /api/sites?architecture="" -> Showing options and filtering based on choice, same for below attributes 
GET /api/sites?material=Stone 
GET /api/sites?religion=Buddhism 
GET /api/sites?civilization=Indus%20Valley -> Attribute mappings 
GET /api/map/sites → for map view (name, lat, long) //done
GET /api/map/nearest?lat=&lng= → nearest site from given coordinates //done
(encodeURIComponent when calling to fix spaces and special) in frontend
*/

app.get("/api/sites", async (req, res) => {
  const {
    featured,
    country,
    continent,
    religion,
    civilization,
    architecture: architecture_style,
    material,
    structure,
    preservation_rank,
    popularity_rank,
    era_category,
    limit = 30,
  } = req.query;

  const filters = {
    country,
    continent,
    religion,
    civilization,
    architecture_style,
    material,
    structure,
    preservation_rank,
    popularity_rank,
    era_category,
  };

  try {
    let query = `SELECT *
      FROM heritage_sites WHERE 1=1`;
    const values = [];

    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;

      if (MULTI_VALUE_COLUMNS.includes(key)) {
        values.push(`%${value}%`);
        query += ` AND ${key} ILIKE $${values.length}`;
      } else {
        values.push(value);
        query += ` AND ${key} = $${values.length}`;
      }
    });

    if (featured && FEATURED_MAPPINGS[featured]) {
      const names = FEATURED_MAPPINGS[featured];

      const placeholders = names
        .map((_, i) => `$${values.length + i + 1}`)
        .join(",");

      query += ` AND name IN (${placeholders})`;
      values.push(...names);
    }

    if (featured && !FEATURED_MAPPINGS[featured]) {
      return res.status(400).json({
        message: "Invalid featured category",
        allowed: Object.keys(FEATURED_MAPPINGS),
      });
    }

    query += `
			ORDER BY preservation_rank DESC, popularity_rank DESC
		`;

    const safeLimit = Math.min(parseInt(limit, 10) || 100, 200);

    values.push(safeLimit);
    query += ` LIMIT $${values.length}`;

    const results = await db.query(query, values);
    console.log("Sites obtained", results.rows.length);
    res.status(200).json(results.rows);
  } catch (err) {
    console.error("SQL Error", err.message);
    res.status(500).json({ message: "Error fetching Sites" });
  }
});

/** Resolve a URL slug like obelisk-tomb-and-bab-as-siq → site row */
app.get("/api/sites/by-slug/:slug", async (req, res) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  try {
    const result = await db.query(`SELECT * FROM heritage_sites WHERE name IS NOT NULL`);
    const toSlug = (name) =>
      String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const row = (result.rows || []).find((s) => toSlug(s.name) === slug);
    if (!row) {
      return res.status(404).json({ message: "Site not found", slug });
    }
    res.status(200).json(row);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Error fetching site by slug" });
  }
});

app.get("/api/search", async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ message: "Query parameter q is required" });
  }

  try {
    const query = `
      SELECT name
      FROM heritage_sites
      WHERE name ILIKE $1
      ORDER BY popularity_rank DESC
      LIMIT 10
    `;

    const values = [`%${q}%`];
    const result = await db.query(query, values);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Search error", err.message);
    res.status(500).json({ message: "Search failed" });
  }
});

app.get("/api/sites/:name/similar", async (req, res) => {
  const { name } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const query = `
      SELECT
        top_5_kmeans,
        top_5_agnes,
        top_5_gmm,
        top_5_similar
      FROM site_similarity
      WHERE site_name = $1
    `;
    const decodedName = decodeURIComponent(name);
    const result = await db.query(query, [decodedName]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No similarity data found" });
    }

    const row = result.rows[0];

    const merged = [
      ...(row.top_5_kmeans || []),
      ...(row.top_5_agnes || []),
      ...(row.top_5_gmm || []),
      ...(row.top_5_similar || []),
    ];

    const map = new Map();
    for (const item of merged) {
      if (!item?.name) continue;
      const sim = Number(item.similarity) || 0;
      if (!map.has(item.name) || sim > map.get(item.name).similarity) {
        map.set(item.name, { ...item, similarity: sim });
      }
    }

    const recommendations = [...map.values()]
      .filter((item) => item.name !== decodedName)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((item) => ({
        name: item.name,
        similarity: item.similarity,
      }));

    res.status(200).json({
      site: decodedName,
      recommendations,
      count: recommendations.length,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Error fetching similar sites" });
  }
});

app.get("/api/themes/:type", async (req, res) => {
  const { type } = req.params;
  const column = THEME_COLUMN_MAP[type];

  if (!column) {
    return res.status(400).json({
      message: "Invalid theme type",
      allowed: Object.keys(THEME_COLUMN_MAP),
    });
  }

  try {
    if (type === "preservation_rank") {
      const result = await db.query(`
    SELECT DISTINCT preservation_rank
    FROM heritage_sites
    WHERE preservation_rank IS NOT NULL
    ORDER BY preservation_rank DESC
  `);

      return res.json(
        result.rows.map((r) => ({
          content: PRESERVATION_MAP[r.preservation_rank] || "Unknown",
          key: r.preservation_rank,
        }))
      );
    }

    if (type === "popularity_rank") {
      const result = await db.query(`
    SELECT DISTINCT popularity_rank
    FROM heritage_sites
    WHERE popularity_rank IS NOT NULL
    ORDER BY popularity_rank DESC
  `);

      return res.json(
        result.rows.map((r) => ({
          content: POPULARITY_MAP[r.popularity_rank] || "Unknown",
          key: r.popularity_rank,
        }))
      );
    }

    if (MULTI_VALUE_COLUMNS.includes(type)) {
      query = `
        SELECT DISTINCT
          INITCAP(TRIM(value)) AS value
        FROM heritage_sites,
             LATERAL regexp_split_to_table(${column}, '\\s*/\\s*|,\\s+') AS value
        WHERE ${column} IS NOT NULL
        ORDER BY value;
      `;
      const result = await db.query(query);

      return res.json(
        result.rows.map((r) => ({
          content: r.value,
          key: r.value,
        }))
      );
    }

    const result = await db.query(`
      SELECT DISTINCT ${column} AS value
      FROM heritage_sites
      WHERE ${column} IS NOT NULL
      ORDER BY value;
    `);
    console.log("THEME API RESPONSE:", result);
    res.status(200).json(
      result.rows.map((r) => ({
        content: r.value,
        key: r.value,
      }))
    );
  } catch (err) {
    console.error("Theme fetch error", err.message);
    res.status(500).json({ message: "Error fetching theme values" });
  }
});

app.get("/api/sites/:name", async (req, res) => {
  const { name } = req.params;

  try {
    const query = `
      SELECT *
      FROM heritage_sites
      WHERE name = $1
    `;
    const decodedName = decodeURIComponent(name);
    const result = await db.query(query, [decodedName]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Site not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Site fetch error", err.message);
    res.status(500).json({ message: "Error fetching site details" });
  }
});

app.get("/api/map/sites", async (req, res) => {
  try {
    const query = `
      SELECT name, latitude, longitude
      FROM heritage_sites
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
    `;

    const result = await db.query(query);

    res.status(200).json({
      count: result.rows.length,
      sites: result.rows,
    });
  } catch (err) {
    console.error("Map sites error", err.message);
    res.status(500).json({ message: "Failed to load map sites" });
  }
});

app.get("/api/map/nearest", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({
      message: "lat and lng query parameters are required",
    });
  }

  try {
    const query = `
      SELECT
        name,
        latitude,
        longitude,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )
        ) AS distance_km
      FROM heritage_sites
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY distance_km
      LIMIT 1;
    `;

    const result = await db.query(query, [lat, lng]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No sites found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Nearest site error", err.message);
    res.status(500).json({ message: "Failed to find nearest site" });
  }
});

/**
 * Phase 2 Option 5: Spatial cluster polygons (convex hulls).
 * Prefer Clustering service artifact; fallback: hulls by civilization from DB coords.
 */
app.get("/api/clusters/spatial-polygons", async (req, res) => {
  const fsPath = path.join(
    __dirname,
    "../../../Clustering/Pickles/spatial_polygons.json"
  );
  if (fs.existsSync(fsPath)) {
    try {
      const raw = fs.readFileSync(fsPath, "utf8");
      return res.status(200).json(JSON.parse(raw));
    } catch (err) {
      console.error("Failed reading spatial_polygons.json", err.message);
    }
  }

  try {
    const result = await db.query(
      `SELECT name, civilization, latitude, longitude
       FROM heritage_sites
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    const byCiv = {};
    for (const row of result.rows) {
      const key = row.civilization || "Unknown";
      if (!byCiv[key]) byCiv[key] = [];
      byCiv[key].push({
        name: row.name,
        lon: Number(row.longitude),
        lat: Number(row.latitude),
      });
    }

    // Convex hull (Andrew's monotone chain) per civilization with >= 3 points
    const cross = (o, a, b) =>
      (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

    const hull = (pts) => {
      const sorted = [...pts].sort((a, b) =>
        a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon
      );
      if (sorted.length < 3) return sorted;
      const lower = [];
      for (const p of sorted) {
        while (
          lower.length >= 2 &&
          cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        ) {
          lower.pop();
        }
        lower.push(p);
      }
      const upper = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (
          upper.length >= 2 &&
          cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        ) {
          upper.pop();
        }
        upper.push(p);
      }
      upper.pop();
      lower.pop();
      return lower.concat(upper);
    };

    const polygons = Object.entries(byCiv).map(([civ, members], idx) => {
      const h = hull(members);
      const ring = h.map((p) => [p.lon, p.lat]);
      if (ring.length) ring.push(ring[0]);
      return {
        cluster_id: idx,
        civilization: civ,
        type: ring.length >= 4 ? "Polygon" : "MultiPoint",
        coordinates: ring.length >= 4 ? [ring] : members.map((m) => [m.lon, m.lat]),
        members: members.map((m) => m.name),
      };
    });

    res.status(200).json({ polygons, source: "civilization_fallback" });
  } catch (err) {
    console.error("Spatial polygons error", err.message);
    res.status(500).json({ message: "Failed to compute spatial polygons" });
  }
});

// SPA fallback — keep after all /api routes
if (SERVE_FRONTEND) {
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD, "index.html"));
  });
}

const PORT = process.env.PORT || 8175;
app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
  if (SERVE_FRONTEND) {
    console.log(`Frontend UI: http://localhost:${PORT}`);
  } else {
    console.log(
      "Frontend build not found. Run: npm --prefix ../frontend run build"
    );
  }
});
