import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import Sidebar from "../Dashboard/Sidebar";
import { getApiBase } from "../lib/api";
import { NAV_LINKS } from "../lib/navLinks";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "dataset", label: "Dataset" },
  { id: "processes", label: "Processes" },
  { id: "similarity", label: "Similarity" },
  { id: "thematic", label: "Thematic GT" },
  { id: "rag", label: "RAG" },
  { id: "agent", label: "Agent chat" },
  { id: "scale", label: "Scale" },
  { id: "study", label: "Preference" },
  { id: "figures", label: "Figures" },
  { id: "services", label: "Services" },
];

function MetricCard({ label, value, hint }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-semibold text-stone-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
    </div>
  );
}

function DistBars({ title, items }) {
  if (!items?.length) return null;
  const max = Math.max(...items.map((x) => x.count), 1);
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-stone-800 mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[8rem_1fr_2.25rem] gap-2 items-center text-sm"
          >
            <span className="text-stone-600 truncate" title={row.label}>
              {row.label}
            </span>
            <div className="h-2.5 bg-stone-100 rounded overflow-hidden">
              <div
                className="h-full bg-stone-800 rounded transition-all"
                style={{ width: `${(100 * row.count) / max}%` }}
              />
            </div>
            <span className="text-stone-500 text-right tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreBars({ title, rows, valueKey = "mrr", maxHint = 1 }) {
  if (!rows?.length) return null;
  const max = Math.max(maxHint, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="mb-4">
      {title && <h3 className="text-sm font-semibold text-stone-800 mb-3">{title}</h3>}
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const v = Number(r[valueKey]) || 0;
          const label = r.method || r.mode || r.label || "-";
          return (
            <li key={label} className="grid grid-cols-[9rem_1fr_3.5rem] gap-2 items-center text-sm">
              <span className="text-stone-700 truncate" title={label}>
                {label}
              </span>
              <div className="h-3 bg-stone-100 rounded overflow-hidden">
                <div
                  className="h-full bg-amber-700/90 rounded"
                  style={{ width: `${(100 * v) / max}%` }}
                />
              </div>
              <span className="text-right font-medium tabular-nums text-stone-800">
                {v.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DataTable({ columns, rows }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto mb-4 rounded-xl border border-stone-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-stone-100 text-left text-stone-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-stone-100">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-stone-800 whitespace-nowrap">
                  {c.render ? c.render(row) : row[c.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${
        ok ? "bg-emerald-500" : "bg-rose-400"
      }`}
    />
  );
}

function Section({ id, title, children, subtitle }) {
  return (
    <section id={id} className="mb-14 scroll-mt-28">
      <h2 className="text-xl font-semibold text-stone-900 mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-stone-500 mb-4">{subtitle}</p>}
      {children}
    </section>
  );
}

/** Multi-process metrics dashboard for the research demo. */
export default function Research() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dash, setDash] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = getApiBase();
    (async () => {
      setLoading(true);
      try {
        const [d, s] = await Promise.all([
          axios.get(`${base}/api/research/dashboard`),
          axios.get(`${base}/api/dataset/stats`),
        ]);
        setDash(d.data);
        setStats(s.data);
      } catch {
        setError("Could not load the research dashboard - is the app server on :8175?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = dash?.metrics;
  const headline = dash?.headline;

  const processStatusColor = useMemo(
    () => ({
      measured: "bg-emerald-100 text-emerald-900",
      measured_synthetic_n: "bg-amber-100 text-amber-950",
      rerun_for_pickles: "bg-stone-100 text-stone-600",
      live_logging: "bg-sky-100 text-sky-900",
    }),
    []
  );

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-stone-100 via-stone-50 to-amber-50/30">
      <nav className="fixed left-0 right-0 top-0 bg-white/95 backdrop-blur text-black px-6 py-4 flex justify-between items-center shadow-sm z-50">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <MenuIcon className="w-6 h-6" />
          </button>
          <NavLink to="/" className="no-underline text-stone-900">
            <h1 className="text-xl font-sans tracking-tight">vHeritage Archive</h1>
          </NavLink>
        </div>
        <div className="hidden md:flex gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm no-underline ${
                  isActive ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} links={NAV_LINKS} />

      <main className="px-4 md:px-10 pt-24 pb-20 max-w-6xl mx-auto w-full">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-2">
            Research demo
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight mb-2">
            Metrics across methods & processes
          </h1>
          <p className="text-stone-600 max-w-3xl">
            Live corpus inventory plus measured evaluation tables for similarity, thematic GT,
            RAG ablations, scale studies, and the preference logger - inspectable in the running demo.
          </p>
        </header>

        {/* Jump nav */}
        <div className="sticky top-[4.25rem] z-40 -mx-1 mb-10 overflow-x-auto">
          <div className="flex gap-1 bg-white/90 backdrop-blur border border-stone-200 rounded-full px-2 py-1.5 shadow-sm w-max min-w-full sm:min-w-0">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-full whitespace-nowrap no-underline"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {loading && <p className="text-sm text-stone-500 mb-8">Loading dashboard…</p>}
        {error && <p className="text-sm text-rose-600 mb-8">{error}</p>}

        {headline && (
          <Section id="overview" title="Overview" subtitle="Headline numbers from the measured archive and live logs.">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <MetricCard label="Sites (n)" value={headline.dataset_n ?? "-"} hint={`${headline.countries ?? "-"} countries`} />
              <MetricCard
                label="Best MRR@5"
                value={headline.best_similarity?.mrr?.toFixed(3) ?? "-"}
                hint={headline.best_similarity?.method}
              />
              <MetricCard
                label="RAG faithfulness"
                value={headline.rag_faithfulness ?? "-"}
                hint={`Hit@K ${headline.rag_hit ?? "-"}`}
              />
              <MetricCard
                label="Preference N"
                value={`${headline.preference_n ?? 0}/${headline.preference_target}`}
                hint="Model vs random study"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Continents" value={headline.continents ?? "-"} />
              <MetricCard label="Processes tracked" value={headline.processes ?? "-"} />
              <MetricCard label="Pickle overlays" value={headline.pickle_files_loaded ?? 0} hint="If Clustering/Pickles/*.json present" />
              <MetricCard
                label="Thematic best"
                value={headline.best_thematic?.mrr?.toFixed(3) ?? "-"}
                hint={headline.best_thematic?.method}
              />
            </div>
            {metrics?.contributions?.length > 0 && (
              <div className="mt-8 p-5 rounded-2xl bg-stone-900 text-stone-100">
                <h3 className="text-sm font-semibold text-amber-200 mb-3">Original contributions</h3>
                <ul className="space-y-2 text-sm list-disc pl-5">
                  {metrics.contributions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {stats && (
          <Section
            id="dataset"
            title="Dataset"
            subtitle="Scale, geography, and feature distributions for the live heritage corpus."
          >
            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              <MetricCard label="Sites" value={stats.n} />
              <MetricCard label="Countries" value={stats.geography?.country_count} />
              <MetricCard label="With coordinates" value={stats.with_coordinates} />
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <DistBars title="Continent" items={stats.geography?.continents} />
              <DistBars title="Era category" items={stats.distributions?.era_category} />
              <DistBars title="Religion" items={stats.distributions?.religion} />
              <DistBars title="Civilization (top)" items={stats.distributions?.civilization} />
              <DistBars title="Preservation" items={stats.distributions?.preservation} />
              <DistBars title="Popularity" items={stats.distributions?.popularity} />
              <DistBars title="Architecture (top)" items={stats.distributions?.architecture_style} />
              <DistBars title="Material (top)" items={stats.distributions?.material} />
            </div>
            <div className="mt-4 grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <h3 className="font-semibold text-stone-800 mb-2">Sources</h3>
                <ul className="space-y-1 text-stone-600 list-disc pl-5">
                  {Object.entries(stats.sources || {}).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-stone-800">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-stone-800 mb-2">Limitations</h3>
                <ul className="space-y-1 text-stone-600 list-disc pl-5">
                  {(stats.limitations || []).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        )}

        {metrics?.processes && (
          <Section
            id="processes"
            title="Evaluation processes"
            subtitle="Every method family we track - measured snapshot vs scripts that need a local Pickles re-run."
          >
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-100 text-left">
                  <tr>
                    <th className="px-3 py-2">Process</th>
                    <th className="px-3 py-2">Metric</th>
                    <th className="px-3 py-2">Script</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.processes.map((p) => (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="px-3 py-2.5 font-medium text-stone-900">{p.name}</td>
                      <td className="px-3 py-2.5 text-stone-600">{p.metric}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-stone-500">{p.script}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            processStatusColor[p.status] || "bg-stone-100"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {metrics?.similarity && (
          <Section
            id="similarity"
            title="Similarity ranking"
            subtitle={metrics.similarity.ranking_insight || "Site-to-site MRR@5 with bootstrap CIs."}
          >
            <div className="grid md:grid-cols-2 gap-8 mb-4">
              <ScoreBars rows={metrics.similarity.site_to_site} />
              <DataTable
                columns={[
                  { key: "method", label: "Method" },
                  {
                    key: "mrr",
                    label: "MRR@5",
                    render: (r) => r.mrr?.toFixed(3),
                  },
                  {
                    key: "ci95",
                    label: "95% CI",
                    render: (r) =>
                      r.ci95 ? `[${r.ci95[0]}, ${r.ci95[1]}]` : "-",
                  },
                ]}
                rows={metrics.similarity.site_to_site}
              />
            </div>
            {metrics.similarity.cross_modal_clip && (
              <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/60 text-sm text-amber-950">
                <p className="font-semibold mb-1">Cross-modal CLIP</p>
                <p>
                  Fine-tuned MRR{" "}
                  <strong>{metrics.similarity.cross_modal_clip.fine_tuned_mrr}</strong>
                  {" · "}
                  {metrics.similarity.cross_modal_clip.pretrained_relative}
                </p>
                <p className="mt-1 text-amber-900/80">
                  {metrics.similarity.cross_modal_clip.insight}
                </p>
              </div>
            )}
          </Section>
        )}

        {metrics?.thematic_gt && (
          <Section
            id="thematic"
            title="Thematic ground truth"
            subtitle={metrics.thematic_gt.note}
          >
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <ScoreBars
                  title="Share ≥ 1 field - MRR@5"
                  rows={metrics.thematic_gt.share_at_least_1_field}
                />
              </div>
              <div>
                <ScoreBars
                  title="Share ≥ 2 fields - MRR@5"
                  rows={metrics.thematic_gt.share_at_least_2_fields}
                />
              </div>
            </div>
            {metrics.thematic_gt.insight && (
              <p className="text-sm text-stone-600 mt-2">{metrics.thematic_gt.insight}</p>
            )}
          </Section>
        )}

        {metrics?.rag && (
          <Section
            id="rag"
            title="RAG retrieval & generation"
            subtitle={`QA set size ${metrics.rag.qa_items} (abstain-excluded ≈ ${metrics.rag.qa_after_abstain_exclude}). Coverage ≈ ${metrics.rag.coverage_approx}.`}
          >
            <div className="grid md:grid-cols-2 gap-8 mb-4">
              <ScoreBars
                title="Retrieval Hit@5"
                rows={metrics.rag.ablation_hit_at_5}
                valueKey="hit"
              />
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Hit@K (gen)"
                  value={metrics.rag.generation_proxies?.hit_at_k}
                />
                <MetricCard
                  label="Faithfulness"
                  value={metrics.rag.generation_proxies?.faithfulness_lexical}
                />
                <MetricCard
                  label="Hallucination proxy"
                  value={metrics.rag.generation_proxies?.hallucination_proxy}
                />
                <MetricCard
                  label="Latency (s)"
                  value={metrics.rag.generation_proxies?.approx_latency_s_after_warmup}
                  hint="after GPU warmup"
                />
              </div>
            </div>
            {metrics.rag.insight && (
              <p className="text-sm text-stone-600">{metrics.rag.insight}</p>
            )}
          </Section>
        )}

        {(metrics?.agent_chat || metrics?.agent_chat_detail) && (
          <Section
            id="agent"
            title="Agent chat & Heritage Mini-LM"
            subtitle="Paper framing: primary claim = extractive hybrid RAG; secondary = compact in-repo Mini-LM (not frontier LLM parity)."
          >
            {metrics.agent_chat?.paper_framing && (
              <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4 text-sm text-stone-700 space-y-2">
                <p>
                  <span className="font-semibold text-stone-900">Primary claim. </span>
                  {metrics.agent_chat.paper_framing.primary_claim}
                </p>
                <p>
                  <span className="font-semibold text-stone-900">Secondary claim. </span>
                  {metrics.agent_chat.paper_framing.secondary_claim}
                </p>
                {metrics.agent_chat.paper_framing.not_claimed?.length > 0 && (
                  <p className="text-stone-500">
                    Not claimed: {metrics.agent_chat.paper_framing.not_claimed.join(" · ")}
                  </p>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label="Hybrid Hit@5"
                value={
                  metrics.agent_chat_detail?.retrieval?.hit_at_k ??
                  metrics.agent_chat?.comparison_table?.[0]?.hit_or_site_mention ??
                  "-"
                }
              />
              <MetricCard
                label="Extractive coverage"
                value={
                  metrics.agent_chat_detail?.extractive?.keyword_coverage ??
                  metrics.agent_chat?.comparison_table?.[1]?.keyword_coverage ??
                  "-"
                }
                hint="keyword match vs gold fields"
              />
              <MetricCard
                label="Mini-LM PPL"
                value={
                  metrics.agent_chat_detail?.minigpt?.perplexity_on_gold_qa ??
                  dash?.headline?.minigpt_ppl ??
                  "-"
                }
                hint="on gold QA teacher-forced"
              />
              <MetricCard
                label="Mini-LM site mention"
                value={
                  metrics.agent_chat_detail?.minigpt?.site_mention_rate ??
                  dash?.headline?.minigpt_site_mention ??
                  "-"
                }
                hint={`${((metrics.heritage_lm_train_meta?.n_params || metrics.systems?.heritage_minigpt?.n_params || 0) / 1e6).toFixed(2)}M params`}
              />
            </div>

            <DataTable
              columns={[
                { key: "system", label: "System" },
                {
                  key: "hit_or_site_mention",
                  label: "Hit@5 / site mention",
                  render: (r) =>
                    r.hit_or_site_mention != null ? Number(r.hit_or_site_mention).toFixed(3) : "-",
                },
                {
                  key: "keyword_coverage",
                  label: "Keyword coverage",
                  render: (r) =>
                    r.keyword_coverage != null ? Number(r.keyword_coverage).toFixed(3) : "-",
                },
                {
                  key: "latency_ms",
                  label: "Latency (ms)",
                  render: (r) => (r.latency_ms != null ? Math.round(r.latency_ms) : "-"),
                },
                { key: "params_notes", label: "Notes" },
              ]}
              rows={metrics.agent_chat?.comparison_table || []}
            />

            {metrics.agent_chat?.training_data && (
              <p className="text-xs text-stone-500 mt-2">
                Training: online CSV {metrics.agent_chat.training_data.online_training_rows} rows ·
                QA CSV {metrics.agent_chat.training_data.qa_training_rows} · Wiki extracts{" "}
                {metrics.agent_chat.training_data.wikipedia_extracts}/49 · tokenizer bigram Jaccard{" "}
                {metrics.agent_chat.tokenizer_roundtrip_bigram_jaccard}
              </p>
            )}
            {metrics.agent_chat?.insight && (
              <p className="text-sm text-stone-600 mt-3">{metrics.agent_chat.insight}</p>
            )}
            <p className="text-xs text-stone-500 mt-2 font-mono">
              Re-measure: python Chatbot/Agent-Based/eval_agent_chat.py → docs/agent_chat_metrics.json
            </p>
          </Section>
        )}

        {metrics?.scale_synthetic && (
          <Section
            id="scale"
            title="Scale (synthetic N)"
            subtitle={metrics.scale_synthetic.note}
          >
            <DataTable
              columns={[
                { key: "n", label: "N" },
                { key: "faiss_vs_brute", label: "FAISS vs brute" },
                {
                  key: "faiss_speedup_approx",
                  label: "Speedup ≈",
                  render: (r) =>
                    r.faiss_speedup_approx != null ? `${r.faiss_speedup_approx}×` : "-",
                },
                {
                  key: "hdbscan_silhouette",
                  label: "HDBSCAN silhouette",
                  render: (r) => r.hdbscan_silhouette?.toFixed(2),
                },
              ]}
              rows={metrics.scale_synthetic.rows}
            />
            {metrics.scale_synthetic.insight && (
              <p className="text-sm text-stone-600">{metrics.scale_synthetic.insight}</p>
            )}
          </Section>
        )}

        {dash?.study && (
          <Section
            id="study"
            title="Preference study"
            subtitle="Human A/B: model recommendation vs random distractor (logged on site pages)."
          >
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <MetricCard label="Events logged" value={dash.study.n} hint={`Target ${dash.headline?.preference_target ?? 30}`} />
              <MetricCard
                label="Chose A rate"
                value={
                  dash.study.prefer_a_rate != null
                    ? dash.study.prefer_a_rate.toFixed(2)
                    : "-"
                }
              />
              <MetricCard
                label="Progress"
                value={`${Math.min(100, Math.round((100 * (dash.study.n || 0)) / (dash.headline?.preference_target || 30)))}%`}
              />
            </div>
            {dash.study.events_tail?.length > 0 ? (
              <DataTable
                columns={[
                  { key: "query_site", label: "Query site" },
                  { key: "chosen", label: "Chosen" },
                  { key: "option_a", label: "Option A" },
                  { key: "option_b", label: "Option B" },
                ]}
                rows={dash.study.events_tail}
              />
            ) : (
              <p className="text-sm text-stone-500">
                No events yet - open a site page and complete the model-vs-random preference prompt.
              </p>
            )}
          </Section>
        )}

        <Section
          id="figures"
          title="Paper figures"
          subtitle="High-DPI exports for the manuscript."
        >
          {dash?.figures?.length ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {dash.figures.map((f) => (
                <a
                  key={f.file}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block bg-white border border-stone-200 rounded-xl overflow-hidden no-underline hover:ring-2 hover:ring-stone-300"
                >
                  <img src={f.url} alt={f.file} className="w-full h-44 object-contain bg-stone-50" />
                  <p className="px-3 py-2 text-xs text-stone-600 font-mono">{f.file}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              No figures found. Run{" "}
              <code className="bg-stone-100 px-1 rounded text-xs">
                python Clustering/export_paper_figures.py
              </code>
            </p>
          )}
        </Section>

        {dash?.services && (
          <Section id="services" title="Live services" subtitle="Health probes from the Application API.">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm">
                <p className="font-medium text-stone-900">
                  <StatusDot ok={dash.services.application?.ok} />
                  Application
                </p>
                <p className="text-stone-500 mt-1">:{dash.services.application?.port}</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm">
                <p className="font-medium text-stone-900">
                  <StatusDot ok={dash.services.clustering?.ok} />
                  Clustering
                </p>
                <p className="text-stone-500 mt-1">
                  {dash.services.clustering?.ok
                    ? `${dash.services.clustering.latency_ms} ms`
                    : dash.services.clustering?.error || "down"}
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm">
                <p className="font-medium text-stone-900">
                  <StatusDot ok={dash.services.agent?.ok} />
                  Agent chat
                </p>
                <p className="text-stone-500 mt-1">
                  {dash.services.agent?.ok
                    ? `${dash.services.agent.latency_ms} ms · :8180`
                    : dash.services.agent?.error || "down (start Agent-Based)"}
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm">
                <p className="font-medium text-stone-900">
                  <StatusDot ok={dash.services.local_rag?.ok} />
                  Local RAG
                </p>
                <p className="text-stone-500 mt-1">
                  {dash.services.local_rag?.ok
                    ? `${dash.services.local_rag.latency_ms} ms${
                        dash.services.local_rag.gpu_layers != null
                          ? ` · GPU layers ${dash.services.local_rag.gpu_layers}`
                          : ""
                      }`
                    : dash.services.local_rag?.error || "down"}
                </p>
              </div>
            </div>

            {dash.demo_features?.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-2">Demo feature surface</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {dash.demo_features.map((f) => (
                    <span
                      key={f}
                      className="text-xs px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-700"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </>
            )}

            {(metrics?.honesty_notes || []).length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-2">Honesty notes</h3>
                <ul className="text-sm text-stone-600 list-disc pl-5 space-y-1 mb-4">
                  {metrics.honesty_notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}

            {dash.reproduce?.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-2">Reproduce</h3>
                <ul className="text-xs font-mono text-stone-600 space-y-1 bg-white border border-stone-200 rounded-xl p-4">
                  {dash.reproduce.map((cmd) => (
                    <li key={cmd}>{cmd}</li>
                  ))}
                </ul>
              </>
            )}
            {dash.metrics_source && (
              <p className="text-xs text-stone-400 mt-4">
                Metrics source: {dash.metrics_source}
                {dash.generated_at ? ` · dashboard ${dash.generated_at}` : ""}
              </p>
            )}
          </Section>
        )}
      </main>
    </div>
  );
}
