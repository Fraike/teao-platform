import { readData, writeData } from "../config.js";
import { jwtAuth } from "../middleware/jwt-auth.js";

export function registerHistoryRoutes(app) {
  app.get("/api/history", jwtAuth, (_req, res) => {
    res.json(readData());
  });

  app.post("/api/history", jwtAuth, (req, res) => {
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

  app.delete("/api/history/:id", jwtAuth, (req, res) => {
    const records = readData().filter((r) => r.id !== req.params.id);
    writeData(records);
    res.json({ ok: true, total: records.length });
  });
}
