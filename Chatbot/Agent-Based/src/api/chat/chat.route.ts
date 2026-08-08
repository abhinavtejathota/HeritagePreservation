import { Router } from "express";
import { chatController, chatStreamController } from "./chat.controller";

const router = Router();

router.post("/", chatController);
router.post("/stream", chatStreamController);

export default router;
