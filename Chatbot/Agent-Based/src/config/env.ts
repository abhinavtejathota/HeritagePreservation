import dotenv from "dotenv";
dotenv.config();

export const env = {
  GROQ_API_KEY: process.env.GROQ_API_KEY!,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
  PORT: process.env.PORT!,
  DB_HOST: process.env.DB_HOST!,
  DB_PORT: Number(process.env.DB_PORT),
  DB_USER: process.env.DB_USER!,
  DB_PASSWORD: process.env.DB_PASSWORD!,
  DB_NAME: process.env.DB_NAME!
};
