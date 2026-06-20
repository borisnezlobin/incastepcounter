import { promises as fs } from "fs";
import path from "path";
import { emptyTrail, type Trail } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "trail.json");

export async function loadTrail(): Promise<Trail> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as Trail;
  } catch {
    return emptyTrail();
  }
}

export async function saveTrail(trail: Trail): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(trail, null, 2), "utf8");
}
