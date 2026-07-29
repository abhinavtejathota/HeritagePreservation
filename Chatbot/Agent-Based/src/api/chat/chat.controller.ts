import { Request, Response } from "express";
import { runOrchestrator } from "../../orchestrator/orchestrator";
import { ChatRequest } from "./chat.types";

export async function chatController(
  req: Request,
  res: Response
) {
  try {
    const body = req.body as ChatRequest;

    if (!body.query || body.query.trim().length === 0) {
      return res.status(400).json({
        error: "Query is required"
      });
    }

    const result = await runOrchestrator(body.query);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Chat controller error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
