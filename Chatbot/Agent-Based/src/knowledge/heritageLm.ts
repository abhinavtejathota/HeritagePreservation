/**
 * Call Heritage Mini-LM (Python under Agent-Based/heritage-lm)
 * with optional multi-turn history for the model context window.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import type { ChatTurn } from "./chatMemory";

const HERITAGE_DIR = path.join(__dirname, "..", "..", "heritage-lm");
const INFER_PY = path.join(HERITAGE_DIR, "infer.py");

export type HeritageLmResult = {
  answer: string;
  backend: string;
  context_window?: number;
};

function pythonBin(): string {
  return process.env.PYTHON || process.env.PYTHON_BIN || "python";
}

export function heritageLmAvailable(): boolean {
  const ckpt = path.join(HERITAGE_DIR, "checkpoints", "heritage_minigpt.pt");
  return fs.existsSync(INFER_PY) && fs.existsSync(ckpt);
}

export async function runHeritageLm(
  query: string,
  history: ChatTurn[] = [],
  timeoutMs = 60000
): Promise<HeritageLmResult | null> {
  if (!heritageLmAvailable()) return null;

  return new Promise((resolve) => {
    const py = pythonBin();
    const child = spawn(py, [INFER_PY, "--json-in", "--tokens", "120"], {
      cwd: HERITAGE_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
    });

    const payload = JSON.stringify({
      query,
      history: history.slice(-6),
    });
    child.stdin.write(payload);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      logger.warn("Heritage Mini-LM timed out");
      resolve(null);
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      logger.warn("Heritage Mini-LM spawn failed", { err });
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = stdout.trim();
      if (code !== 0 || !raw) {
        if (stderr) logger.warn("Heritage Mini-LM stderr", { stderr: stderr.slice(0, 400) });
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.ok || !parsed.answer) {
          resolve(null);
          return;
        }
        resolve({
          answer: String(parsed.answer),
          backend: parsed.backend || "heritage-minigpt",
          context_window: parsed.context_window,
        });
      } catch {
        // plain-text fallback
        if (raw.startsWith("Missing checkpoint")) {
          resolve(null);
          return;
        }
        resolve({ answer: raw, backend: "heritage-minigpt" });
      }
    });
  });
}
