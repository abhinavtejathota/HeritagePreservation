import express from "express";
import chatRoutes from "./api/chat/chat.route";
import { API, APP } from "./config/constants";
import cors from "cors";
import { env } from "./config/env";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: APP.NAME,
    version: APP.VERSION,
    mode: "agent-hybrid-rag",
    port: Number(env.PORT),
    clustering_url: env.CLUSTERING_URL,
    local_rag_fallback: env.LOCAL_RAG_URL,
    cloud_llm_polish: Boolean(env.GOOGLE_API_KEY || env.GROQ_API_KEY),
  });
});

app.use(`${API.BASE_PATH}${API.CHAT_PATH}`, chatRoutes);

export default app;
