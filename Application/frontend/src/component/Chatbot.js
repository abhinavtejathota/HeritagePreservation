import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { getKidsMode } from "../lib/prefs";
import { getChatApiBase } from "../lib/api";

/** Primary: Agent hybrid RAG (:8180). Local-RAG GGUF is server-side fallback. */
const API_CHA = getChatApiBase();

const adultHello =
  "Hi - I'm PineAI. Ask about heritage places, buildings, history, or eras. I'll stick to what's in this archive.";
const kidsHello =
  "Hi! I'm PineAI. Ask me about cool old places - castles, temples, caves. I'll keep answers short and simple.";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState(() => getKidsMode());
  const [sessionId, setSessionId] = useState(() => {
    const existing = localStorage.getItem("pineai_session");
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem("pineai_session", id);
    return id;
  });
  const [messages, setMessages] = useState([
    { sender: "bot", text: getKidsMode() ? kidsHello : adultHello },
  ]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [useStream, setUseStream] = useState(true);
  const [pendingAsk, setPendingAsk] = useState(null);
  const bottomRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    const onKids = (e) => {
      const on = !!e.detail?.on;
      setKids(on);
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].sender === "bot") {
          return [{ sender: "bot", text: on ? kidsHello : adultHello }];
        }
        return prev;
      });
    };
    const onAsk = (e) => {
      const q = e.detail?.question;
      if (!q) return;
      setOpen(true);
      setPendingAsk(q);
    };
    window.addEventListener("vheritage:kids", onKids);
    window.addEventListener("pineai:ask", onAsk);
    return () => {
      window.removeEventListener("vheritage:kids", onKids);
      window.removeEventListener("pineai:ask", onAsk);
    };
  }, []);

  const applySession = (sid) => {
    if (sid && sid !== sessionId) {
      setSessionId(sid);
      localStorage.setItem("pineai_session", sid);
    }
  };

  const handleSend = async (msg) => {
    const text = (msg || input).trim();
    if (!text || loadingRef.current) return;

    const askText = kids
      ? `${text}\n\n(Please answer in short, simple words for a young visitor.)`
      : text;

    setMessages((prev) => [...prev, { sender: "user", text }]);
    setInput("");
    loadingRef.current = true;
    setLoading(true);

    if (useStream) {
      await sendStream(askText, text);
    } else {
      await sendJson(askText, text);
    }
    loadingRef.current = false;
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !pendingAsk || loadingRef.current) return;
    const q = pendingAsk;
    setPendingAsk(null);
    handleSend(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingAsk]);

  const buildHistory = () =>
    messages
      .filter((m) => m.sender === "user" || m.sender === "bot")
      .filter((m) => m.text && !m.streaming)
      .slice(-6)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: String(m.text),
      }));

  const sendJson = async (askText, displayText) => {
    try {
      const res = await fetch(`${API_CHA}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: askText,
          session_id: sessionId,
          history: buildHistory(),
        }),
      });
      const data = await res.json();
      applySession(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: data.answer || "No answer returned.",
          reasoning: kids ? undefined : data.reasoning,
          confidence: data.confidence,
          citations: kids ? undefined : data.citations || data.ragContexts,
          sources: data.sources,
          mode: data.mode,
          backend: data.backend,
          latencyMs: data.latency_ms,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Unable to reach the assistant right now. Start the chat service and try again.",
        },
      ]);
    }
  };

  const sendStream = async (askText, displayText) => {
    const botIdxRef = { current: -1 };
    setMessages((prev) => {
      botIdxRef.current = prev.length;
      return [
        ...prev,
        {
          sender: "bot",
          text: "",
          streaming: true,
          citations: [],
        },
      ];
    });

    try {
      const res = await fetch(`${API_CHA}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: askText,
          session_id: sessionId,
          history: buildHistory(),
        }),
      });
      if (!res.ok || !res.body) throw new Error("stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rawAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev;
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.type === "meta") {
            applySession(ev.session_id);
            setMessages((prev) => {
              const next = [...prev];
              const i = botIdxRef.current;
              if (next[i])
                next[i] = {
                  ...next[i],
                  citations: kids ? [] : ev.citations || [],
                };
              return next;
            });
          } else if (ev.type === "token") {
            rawAccum += ev.text || "";
            const am = rawAccum.match(/ANSWER:\s*([\s\S]*?)(?=\nCONFIDENCE:|$)/i);
            const display = am ? am[1].trim() : rawAccum;
            setMessages((prev) => {
              const next = [...prev];
              const i = botIdxRef.current;
              if (next[i]) next[i] = { ...next[i], text: display, streaming: true };
              return next;
            });
          } else if (ev.type === "done") {
            applySession(ev.session_id);
            setMessages((prev) => {
              const next = [...prev];
              const i = botIdxRef.current;
              if (next[i]) {
                next[i] = {
                  ...next[i],
                  text: ev.answer || next[i].text,
                  reasoning: kids ? undefined : ev.reasoning,
                  confidence: ev.confidence,
                  citations: kids ? undefined : ev.citations || next[i].citations,
                  sources: ev.sources,
                  streaming: false,
                };
              }
              return next;
            });
          } else if (ev.type === "error") {
            throw new Error(ev.error || "stream error");
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !(m.streaming && !m.text)));
      await sendJson(askText);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-stone-900 text-white shadow-xl flex items-center justify-center z-50 hover:bg-stone-700 transition hover:scale-105 overflow-hidden p-0"
        aria-label="Open PineAI chat"
      >
        <img
          src="/logo.jpg"
          alt="PineAI"
          className="w-full h-full object-cover"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-0 md:inset-auto md:bottom-6 md:right-6"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="absolute bottom-0 right-0 md:relative bg-white w-full md:w-[420px] h-[min(85vh,560px)] md:rounded-2xl shadow-2xl flex flex-col ring-1 ring-stone-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-4 py-3 border-b bg-gradient-to-r from-stone-900 to-stone-800 text-white">
                <div className="flex items-center gap-3 min-w-0 text-left">
                  <img
                    src="/logo.jpg"
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover ring-1 ring-white/20 shrink-0"
                  />
                  <div className="min-w-0 text-left">
                    <h2 className="font-semibold tracking-tight text-left">PineAI</h2>
                    <p className="text-[11px] text-stone-300 text-left">
                      {kids ? "Kids mode · simple answers" : "Heritage guide"} ·{" "}
                      {useStream ? "live" : "batch"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-[10px] uppercase tracking-wide opacity-80 hover:opacity-100"
                    onClick={() => setUseStream((v) => !v)}
                    title="Toggle token streaming"
                  >
                    {useStream ? "SSE" : "JSON"}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-lg leading-none opacity-80 hover:opacity-100"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-stone-50/80">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${
                      m.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`p-3 rounded-2xl max-w-[90%] text-sm leading-relaxed shadow-sm ${
                        m.sender === "user"
                          ? "bg-stone-900 text-white rounded-br-md"
                          : "bg-white text-stone-800 rounded-bl-md ring-1 ring-stone-100"
                      }`}
                    >
                      <ReactMarkdown>{m.text || (m.streaming ? "…" : "")}</ReactMarkdown>
                    </div>
                    {m.sender === "bot" && m.reasoning && (
                      <details className="mt-1 max-w-[90%] text-[11px] text-stone-500">
                        <summary className="cursor-pointer hover:text-stone-700">
                          Reasoning
                          {typeof m.confidence === "number"
                            ? ` · conf ${m.confidence}`
                            : ""}
                        </summary>
                        <p className="mt-1 pl-2 border-l-2 border-amber-300">{m.reasoning}</p>
                      </details>
                    )}
                    {m.sender === "bot" && m.citations?.length > 0 && (
                      <ul className="mt-1 max-w-[90%] text-[10px] text-stone-500 space-y-0.5">
                        {m.citations.slice(0, 5).map((c, j) => (
                          <li key={j}>
                            <span className="font-medium text-stone-600">{c.name}</span>
                            {c.aspect ? ` · ${c.aspect}` : ""}
                            {typeof c.score === "number"
                              ? ` · score ${Number(c.score).toFixed(2)}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.sender === "bot" &&
                      !m.citations?.length &&
                      m.sources?.length > 0 && (
                        <p className="mt-1 text-[10px] text-stone-400 max-w-[90%]">
                          Sources: {[...new Set(m.sources)].slice(0, 4).join(", ")}
                        </p>
                      )}
                    {m.sender === "bot" && typeof m.latencyMs === "number" && (
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        {(m.latencyMs / 1000).toFixed(1)}s
                        {m.backend ? ` · ${m.backend}` : ""}
                      </p>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="text-xs text-stone-400 animate-pulse px-1">
                    Retrieving & reasoning locally…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="p-3 border-t bg-white flex gap-2">
                <input
                  className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400/40 outline-none"
                  type="text"
                  value={input}
                  placeholder="Ask about Ajanta, Petra, eras…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                />
                <button
                  className="bg-stone-900 text-white px-4 rounded-xl text-sm hover:bg-stone-700 transition disabled:opacity-50"
                  disabled={loading}
                  onClick={() => handleSend()}
                >
                  Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
