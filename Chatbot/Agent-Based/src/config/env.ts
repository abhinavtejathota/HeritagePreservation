import dotenv from "dotenv";
dotenv.config();

/** API keys optional — extractive RAG needs none; Local-RAG is fallback. */
export const env = {
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
  /** Agent RAG primary chat port (Local-RAG stays on 8176 as fallback) */
  PORT: process.env.PORT || "8180",
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || "",
  DB_PASSWORD: process.env.DB_PASSWORD || "",
  DB_NAME: process.env.DB_NAME || "",
  CLUSTERING_URL: process.env.CLUSTERING_URL || "http://localhost:8177",
  LOCAL_RAG_URL: process.env.LOCAL_RAG_URL || "http://localhost:8176",
};
