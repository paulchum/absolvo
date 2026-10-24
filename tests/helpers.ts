import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { closeDb } from "../src/lib/db";

/** Points the app at a fresh data directory for one test file. */
export function useTempData(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `absolvo-${name}-`));
  process.env.ABSOLVO_DATA_DIR = dir;
  process.env.ABSOLVO_MOCK_DELAY_MS = "0";
  process.env.ABSOLVO_INQUISITOR = "mock";
  return { dir, cleanup() { closeDb(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

export async function samplePng(width = 120, height = 200, colour = "#c0392b") {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = colour;
  context.fillRect(10, 10, width - 20, height / 3);
  return canvas.encode("png");
}
