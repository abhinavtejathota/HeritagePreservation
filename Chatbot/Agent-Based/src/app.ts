import express from "express";
import chatRoutes from "./api/chat/chat.route";
import { API } from "./config/constants";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.use(`${API.BASE_PATH}${API.CHAT_PATH}`, chatRoutes);

export default app;
