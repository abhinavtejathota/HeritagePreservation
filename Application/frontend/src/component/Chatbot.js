// src/component/Chatbot.js
//session to be implemented
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

const API_FALLBACK = process.env.REACT_APP_GOG_URL;

if (!API_FALLBACK) {
  console.error("REACT_APP_GOG_URL is not defined");
}

const API_CHA = process.env.REACT_APP_CHA_URL;
if (!API_CHA) {
  console.error("REACT_APP_CHA_URL is not defined");
}

/*
let sessionId = localStorage.getItem("session_id");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("session_id", sessionId);
}
*/

const FALLBACK_TRIGGERS = [
  "Architectural details are not available for this monument.",
  "Civilizational and religious details are unavailable for this monument.",
  "Monument details are unavailable.",
  "The construction period of this monument is unknown.",
  "Sorry, I couldn't find an answer.",
  "The historical time period of this monument is not available.",
  "No monument information found.",
  "Geographical location information is unavailable.",
  "No architectural information found.",
  "No civilization or religious information found."
];

const shouldFallback = (answer) => {
  if (!answer) return false;

  const hit = FALLBACK_TRIGGERS.find(trigger =>
    answer.toLowerCase().includes(trigger.toLowerCase())
  );
  if (hit) {
    console.log("Fallback triggered by:", hit);
  }

  return Boolean(hit);
};

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (msg) => {
    if (!msg.trim()) return;

    setMessages((prev) => [...prev, { sender: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_CHA}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: msg }),
      });
    
      const data = await res.json();
    
      if (shouldFallback(data.answer)) {
        console.warn("Fallback triggered → calling GOG API");
    
        const fallbackRes = await fetch(`${API_FALLBACK}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: msg
          }),
        });
    
        const fallbackData = await fallbackRes.json();
    
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: fallbackData.reply }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: data.answer }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "⚠️ Unable to connect right now." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/*CHAT ICON*/}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-black text-white shadow-lg flex items-center justify-center z-50 hover:bg-gray-700"
      >
        💬
      </button>

      {/*CHAT WINDOW*/}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="bg-white w-[500px] h-[450px] rounded-t-xl shadow-xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/*HEADER*/}
              <div className="flex justify-between items-center p-2 border-b">
                <h2 className="font-semibold">PineAI</h2>
                <button onClick={() => setOpen(false)} className="text-xl">
                  ✕
                </button>
              </div>

              {/*MESSAGES*/}
              <div className="flex-1 p-2 overflow-y-auto space-y-2">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded max-w-[85%] ${
                      m.sender === "user"
                        ? "bg-blue-100 self-end ml-auto"
                        : "bg-gray-200 self-start"
                    }`}
                  >
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                ))}

                {loading && (
                  <div className="text-sm text-gray-400">Pine is typing…</div>
                )}
              </div>

              {/*INPUT*/}
              <div className="p-2 border-t flex gap-2">
                <input
                  id="chatInput"
                  className="flex-1 border rounded px-2 py-1"
                  type="text"
                  placeholder="Ask about this site..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSend(e.target.value);
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  className="bg-black text-white px-4 rounded"
                  onClick={() => {
                    const input = document.getElementById("chatInput");
                    handleSend(input.value);
                    input.value = "";
                  }}
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
