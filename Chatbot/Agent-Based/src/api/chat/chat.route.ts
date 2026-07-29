import { Router } from "express";
import { chatController } from "./chat.controller";

const router = Router();

/*
	* POST /api/chat
	* body: { query: string }
*/
router.post("/", chatController);

export default router;
