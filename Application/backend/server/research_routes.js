/**
 * Research transparency endpoints — dataset inventory + multi-process metrics dashboard.
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "../../..");
const METRICS_CANDIDATES = [
  path.join(ROOT, "docs/research_metrics.json"),
  path.join(ROOT, "Clustering/Pickles/benchmark_metrics.json"),
  path.join(ROOT, "Clustering/Pickles/research_metrics.json"),
];

const AGENT_CHAT_METRICS = path.join(ROOT, "docs/agent_chat_metrics.json");
const HERITAGE_TRAIN_META = path.join(
  ROOT,
  "Chatbot/Agent-Based/heritage-lm/checkpoints/train_meta.json"
);

const PICKLE_METRIC_FILES = [
  "benchmark_metrics.json",
  "bootstrap_mrr_metrics.json",
  "thematic_gt_metrics.json",
  "rag_ablation_metrics.json",
  "scale_cluster_metrics.json",
  "scale_latency_metrics.json",
  "feature_fusion_comparison.json",
  "vectorizer_comparison.json",
  "gnn_loro_metrics.json",
  "hybrid_arch_metrics.json",
];

const DATASET_CSV = path.join(ROOT, "Dataset/heritage_sites_v2.csv");
const FIGURES_DIR = path.join(ROOT, "docs/paper_figures");
const STUDY_LOG = path.join(__dirname, "data", "study_events.jsonl");

function countMap(rows, key, { trim = true, limit = 20 } = {}) {
  const m = new Map();
  for (const r of rows) {
    let v = r[key];
    if (v == null || v === "") continue;
    if (trim) v = String(v).trim();
    if (!v) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function loadMetricsFile() {
  for (const p of METRICS_CANDIDATES) {
    if (fs.existsSync(p)) {
      try {
        return {
          path: path.relative(ROOT, p).replace(/\\/g, "/"),
          data: JSON.parse(fs.readFileSync(p, "utf8")),
        };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function loadAgentChatMetrics() {
  const out = { detail: null, train_meta: null };
  if (fs.existsSync(AGENT_CHAT_METRICS)) {
    try {
      out.detail = JSON.parse(fs.readFileSync(AGENT_CHAT_METRICS, "utf8"));
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(HERITAGE_TRAIN_META)) {
    try {
      out.train_meta = JSON.parse(fs.readFileSync(HERITAGE_TRAIN_META, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function loadPickleMetrics() {
  const dir = path.join(ROOT, "Clustering/Pickles");
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const name of PICKLE_METRIC_FILES) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    try {
      found[name.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* skip corrupt */
    }
  }
  return found;
}

function listFigures() {
  if (!fs.existsSync(FIGURES_DIR)) return [];
  return fs
    .readdirSync(FIGURES_DIR)
    .filter((f) => /\.(png|jpg|svg)$/i.test(f))
    .map((f) => ({
      file: f,
      url: `/paper-figures/${f}`,
    }));
}

function readStudySummary() {
  if (!fs.existsSync(STUDY_LOG)) {
    return { n: 0, prefer_a_rate: null, model_wins: null, events_tail: [] };
  }
  const lines = fs
    .readFileSync(STUDY_LOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const n = lines.length;
  const preferA = lines.filter((e) => e.chose_a).length;
  // When model_is is tracked on pair creation, preference log may only have chose_a
  return {
    n,
    prefer_a_rate: n ? preferA / n : null,
    events_tail: lines.slice(-8).reverse(),
  };
}

async function probe(url, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ms = Date.now() - started;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, latency_ms: ms, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - started,
      error: err.name === "AbortError" ? "timeout" : "unreachable",
    };
  } finally {
    clearTimeout(t);
  }
}

function registerResearchRoutes(app, db) {
  // High-DPI paper figures for the demo / manuscript
  if (fs.existsSync(FIGURES_DIR)) {
    app.use("/paper-figures", require("express").static(FIGURES_DIR));
  }

  app.get("/api/dataset/stats", async (req, res) => {
    try {
      const result = await db.query(`
        SELECT name, country, continent, era_category, civilization, religion,
               architecture_style, material, structure, preservation, popularity,
               preservation_rank, popularity_rank, latitude, longitude
        FROM heritage_sites
        WHERE name IS NOT NULL
      `);
      const rows = result.rows || [];
      const withCoords = rows.filter(
        (r) => r.latitude != null && r.longitude != null
      ).length;

      const sources = {
        primary_csv: "Dataset/heritage_sites_v2.csv",
        prior_csv: "Dataset/heritage_sites_v1.csv (n=19, superseded)",
        storage: "PostgreSQL table heritage_sites (synced from CSV)",
        images: "Application/frontend/public/sites/<slug>.jpg",
        growth_policy:
          "Dataset/candidates/ — verified rows only; no invented sites (see README)",
        notes:
          "Corpus curated for this project from public heritage metadata; n is fixed until candidates pass validation.",
      };

      res.json({
        n: rows.length,
        with_coordinates: withCoords,
        columns: [
          "name",
          "country",
          "continent",
          "era_category",
          "civilization",
          "religion",
          "architecture_style",
          "material",
          "structure",
          "preservation",
          "popularity",
          "latitude",
          "longitude",
        ],
        geography: {
          countries: countMap(rows, "country", { limit: 30 }),
          continents: countMap(rows, "continent"),
          country_count: new Set(
            rows.map((r) => (r.country || "").trim()).filter(Boolean)
          ).size,
        },
        distributions: {
          era_category: countMap(rows, "era_category"),
          religion: countMap(rows, "religion"),
          civilization: countMap(rows, "civilization", { limit: 12 }),
          preservation: countMap(rows, "preservation"),
          popularity: countMap(rows, "popularity"),
          architecture_style: countMap(rows, "architecture_style", {
            limit: 12,
          }),
          material: countMap(rows, "material", { limit: 10 }),
        },
        sources,
        limitations: [
          "Small curated corpus (n=49) — not a global UNESCO dump",
          "No sites in Americas or Oceania in the current release",
          "Scale/latency studies that expand N synthetically are labeled separately in metrics JSON",
        ],
        csv_on_disk: fs.existsSync(DATASET_CSV),
      });
    } catch (err) {
      console.error("dataset/stats", err);
      res.status(500).json({ message: "Failed to compute dataset stats" });
    }
  });

  app.get("/api/research/metrics", (req, res) => {
    try {
      const loaded = loadMetricsFile();
      if (!loaded) {
        return res.status(404).json({
          message:
            "No metrics JSON found. Commit docs/research_metrics.json or run Clustering benchmarks.",
        });
      }
      const pickles = loadPickleMetrics();
      const agentChat = loadAgentChatMetrics();
      res.json({
        source_file: loaded.path,
        ...loaded.data,
        agent_chat_detail: agentChat.detail,
        heritage_lm_train_meta: agentChat.train_meta,
        pickle_overlays: Object.keys(pickles),
        pickles,
      });
    } catch (err) {
      console.error("research/metrics", err);
      res.status(500).json({ message: "Failed to load research metrics" });
    }
  });

  app.get("/api/research/overview", async (req, res) => {
    try {
      const count = await db.query(
        `SELECT COUNT(*)::int AS n FROM heritage_sites WHERE name IS NOT NULL`
      );
      const metrics = loadMetricsFile();
      const study = readStudySummary();
      res.json({
        dataset_n: count.rows[0]?.n ?? null,
        metrics_available: !!metrics,
        metrics_source: metrics?.path || null,
        preference_study_n: study.n,
        preference_study_target: 30,
        paper_figures_dir: "docs/paper_figures",
        regenerate_figures: "python Clustering/export_paper_figures.py",
        figures: listFigures(),
      });
    } catch (err) {
      console.error("research/overview", err);
      res.status(500).json({ message: "Overview failed" });
    }
  });

  /** One-shot demo payload: dataset + metrics + live services + study */
  app.get("/api/research/dashboard", async (req, res) => {
    try {
      const loaded = loadMetricsFile();
      const pickles = loadPickleMetrics();
      const agentChat = loadAgentChatMetrics();
      const study = readStudySummary();
      const figures = listFigures();

      const countR = await db.query(
        `SELECT COUNT(*)::int AS n,
                COUNT(DISTINCT country)::int AS countries,
                COUNT(DISTINCT continent)::int AS continents
         FROM heritage_sites WHERE name IS NOT NULL`
      );
      const row = countR.rows[0] || {};

      const clusteringUrl =
        process.env.CLUSTERING_URL || "http://localhost:8177";
      const ragUrl = process.env.LOCAL_RAG_URL || "http://localhost:8176";
      const agentUrl = process.env.AGENT_URL || "http://localhost:8180";

      const [clusteringHealth, ragHealth, agentHealth] = await Promise.all([
        probe(`${clusteringUrl}/openapi.json`).then((r) =>
          r.ok ? r : probe(`${clusteringUrl}/`)
        ),
        probe(`${ragUrl}/api/health`),
        probe(`${agentUrl}/api/health`),
      ]);
      const m = loaded?.data || {};
      const bestSim = (m.similarity?.site_to_site || [])[0] || null;
      const bestThematic = (m.thematic_gt?.share_at_least_1_field || [])[0] || null;
      const ac = m.agent_chat || {};
      const acDetail = agentChat.detail || {};

      res.json({
        generated_at: new Date().toISOString(),
        headline: {
          dataset_n: row.n ?? null,
          countries: row.countries ?? null,
          continents: row.continents ?? null,
          best_similarity: bestSim,
          best_thematic: bestThematic,
          rag_faithfulness: m.rag?.generation_proxies?.faithfulness_lexical ?? null,
          rag_hit: m.rag?.generation_proxies?.hit_at_k ?? null,
          agent_hybrid_hit: acDetail.retrieval?.hit_at_k ?? ac.comparison_table?.[0]?.hit_or_site_mention ?? null,
          minigpt_ppl: acDetail.minigpt?.perplexity_on_gold_qa ?? null,
          minigpt_site_mention: acDetail.minigpt?.site_mention_rate ?? null,
          preference_n: study.n,
          preference_target: 30,
          processes: (m.processes || []).length,
          pickle_files_loaded: Object.keys(pickles).length,
        },
        services: {
          application: { ok: true, port: Number(process.env.PORT) || 8175 },
          clustering: {
            url: clusteringUrl,
            ok: clusteringHealth.ok,
            latency_ms: clusteringHealth.latency_ms,
            error: clusteringHealth.error || null,
          },
          local_rag: {
            url: ragUrl,
            ok: ragHealth.ok,
            latency_ms: ragHealth.latency_ms,
            gpu_layers: ragHealth.body?.gpu_layers ?? ragHealth.body?.n_gpu_layers ?? null,
            error: ragHealth.error || null,
          },
          agent: {
            url: agentUrl,
            ok: agentHealth.ok,
            latency_ms: agentHealth.latency_ms,
            error: agentHealth.error || null,
          },
        },
        study,
        figures,
        metrics_source: loaded?.path || null,
        metrics: loaded
          ? {
              ...m,
              pickles,
              agent_chat_detail: agentChat.detail,
              heritage_lm_train_meta: agentChat.train_meta,
            }
          : null,
        demo_features: m.systems?.features_demo || [],
        reproduce: m.reproduce || [],
      });
    } catch (err) {
      console.error("research/dashboard", err);
      res.status(500).json({ message: "Dashboard failed" });
    }
  });
}

module.exports = { registerResearchRoutes };
