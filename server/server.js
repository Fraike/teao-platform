import fs from "node:fs";
import path from "node:path";
import express from "express";

const PORT = 3899;
const DATA_DIR = "/var/www/teao-platform/data";
const DATA_FILE = path.join(DATA_DIR, "history.json");
const PASSWORD = "teao123";

const app = express();
app.use(express.json({ limit: "10mb" }));

function auth(req, res, next) {
  const pw = req.headers["x-auth-password"];
  if (pw !== PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeData(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), "utf-8");
}

app.get("/api/history", auth, (_req, res) => {
  res.json(readData());
});

app.post("/api/history", auth, (req, res) => {
  const { record } = req.body;
  if (!record || !record.id || !record.quoteNo) {
    return res.status(400).json({ error: "invalid record" });
  }
  const records = readData();
  const idx = records.findIndex((r) => r.quoteNo === record.quoteNo);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  writeData(records);
  res.json({ ok: true, total: records.length });
});

app.delete("/api/history/:id", auth, (req, res) => {
  const records = readData().filter((r) => r.id !== req.params.id);
  writeData(records);
  res.json({ ok: true, total: records.length });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`teao-api running on port ${PORT}`);
});
