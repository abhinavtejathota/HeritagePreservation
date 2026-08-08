import { Request, Response } from "express";
import { runOrchestrator } from "../../orchestrator/orchestrator";
import { ChatRequest } from "./chat.types";

export async function chatController(req: Request, res: Response) {
  try {
    const body = req.body as ChatRequest;
    const queryText = body.query || body.message;

    if (!queryText || queryText.trim().length === 0) {
      return res.status(400).json({
        error: "Query is required",
      });
    }

    const result = await runOrchestrator({
      query: queryText,
      ...(body.session_id ? { session_id: body.session_id } : {}),
      ...((body.history || body.messages)
        ? { history: body.history || body.messages }
        : {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Chat controller error:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

/** SSE compatible with the React Chatbot stream client */
export async function chatStreamController(req: Request, res: Response) {
  try {
    const body = req.body as ChatRequest;
    const queryText = body.query || body.message;
    if (!queryText || queryText.trim().length === 0) {
      return res.status(400).json({ error: "Query is required" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (obj: unknown) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    const result = await runOrchestrator({
      query: queryText,
      ...(body.session_id ? { session_id: body.session_id } : {}),
      ...((body.history || body.messages)
        ? { history: body.history || body.messages }
        : {}),
    });
    send({
      type: "meta",
      session_id: result.session_id || body.session_id || null,
      mode: result.mode,
      backend: result.backend,
      confidence: result.confidence,
      citations: result.citations || result.ragContexts,
      sources: result.sources,
      reasoning: result.reasoning,
    });

    const text = result.answer || "";
    const chunkSize = 24;
    for (let i = 0; i < text.length; i += chunkSize) {
      send({ type: "token", token: text.slice(i, i + chunkSize) });
    }
    send({
      type: "done",
      answer: text,
      latency_ms: result.latency_ms,
      mode: result.mode,
    });
    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.write(
      `data: ${JSON.stringify({ type: "done", answer: "Stream failed." })}\n\n`
    );
    res.end();
  }
}
