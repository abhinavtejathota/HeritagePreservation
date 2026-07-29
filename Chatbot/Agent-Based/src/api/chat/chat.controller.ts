import { Request, Response } from "express";
import { runOrchestrator } from "../../orchestrator/orchestrator";
import { ChatRequest } from "./chat.types";

export async function chatController(
  req: Request,
  res: Response
) {
  try {
    const body = req.body as ChatRequest;
    const queryText = body.query || body.message;

    if (!queryText || queryText.trim().length === 0) {
      return res.status(400).json({
        error: "Query is required"
      });
    }

    const result = await runOrchestrator(queryText);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Chat controller error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
