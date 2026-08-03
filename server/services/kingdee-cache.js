import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.js";

const LEGACY_DATA_KEYS = {
  materials: "materials",
  categories: "categories",
  customers: "customers",
  suppliers: "suppliers",
  outsideMaterials: "outsideMaterials",
};

function cacheFile(key) {
  return path.join(DATA_DIR, `kingdee_${key}.json`);
}

export function readKingdeeCache(key) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile(key), "utf8"));
    const data = Array.isArray(parsed) ? parsed : parsed.data ?? parsed[LEGACY_DATA_KEYS[key]];
    if (!Array.isArray(data)) return null;
    return { data, fetchedAt: parsed.fetchedAt || null };
  } catch {
    return null;
  }
}

export function writeKingdeeCache(key, data) {
  const file = cacheFile(key);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), data }), "utf8");
}
