// 车型代号回填脚本：
// 从 product_standard_versions.customer 里拆出「车型代号」（中文客户名后的字母数字串），
// 写入 vehicle_model 列，并把代号从 customer 中移除（保留 ▲/* 标记）。
// 默认 dry-run，加 --apply 才写库。
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/node_modules 里的 better-sqlite3 可能按不同 Node 版本编译，这里从项目根解析
const rootRequire = createRequire(path.resolve(__dirname, "../../package.json"));
const Database = rootRequire("better-sqlite3");
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "standards.db");

const APPLY = process.argv.includes("--apply");

/**
 * 拆分规则：
 * - 提取尾部 ▲/* 标记（保留在 customer 里）；
 * - 找到剩余部分最后一个中文字符；
 * - 其后紧跟的「大写字母/数字开头，仅含大写字母、数字、连字符、斜杠、点」的串视为车型代号；
 * - 否则（海外客户、人名、括号等）不拆，保持原样。
 */
function splitVehicleModel(raw) {
  const s = String(raw ?? "").trim();
  const markMatch = s.match(/[▲*]+$/);
  const marks = markMatch ? markMatch[0] : "";
  const body = s.slice(0, s.length - marks.length);

  let lastCjk = -1;
  for (let i = 0; i < body.length; i++) {
    if (/[一-龥]/.test(body[i])) lastCjk = i;
  }
  if (lastCjk < 0) return { customer: s, vehicleModel: "" };

  const prefix = body.slice(0, lastCjk + 1).trimEnd();
  const suffix = body.slice(lastCjk + 1).trim();
  // 车型代号必须含字母（排除纯数字的序号/变体号，如 01、2946、534）
  if (!suffix || !/[A-Z]/.test(suffix) || !/^[A-Z0-9][A-Z0-9\-/.]*$/.test(suffix)) {
    return { customer: s, vehicleModel: "" };
  }
  return { customer: prefix + marks, vehicleModel: suffix };
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("standards.db 不存在:", DB_PATH);
    process.exit(1);
  }
  const db = new Database(DB_PATH);

  const cols = db.prepare("PRAGMA table_info(product_standard_versions)").all();
  const hasColumn = cols.some((c) => c.name === "vehicle_model");
  if (!hasColumn) {
    if (APPLY) {
      db.exec("ALTER TABLE product_standard_versions ADD COLUMN vehicle_model TEXT DEFAULT ''");
      console.log("已新增列 vehicle_model");
    } else {
      console.log("[dry-run] 需新增列 vehicle_model（--apply 时执行 ALTER）");
    }
  }

  const rows = db
    .prepare(
      hasColumn
        ? "SELECT id, customer, vehicle_model FROM product_standard_versions"
        : "SELECT id, customer FROM product_standard_versions"
    )
    .all();
  const plans = [];
  for (const row of rows) {
    if (hasColumn && row.vehicle_model) continue; // 已有代号，跳过（幂等）
    const { customer, vehicleModel } = splitVehicleModel(row.customer);
    if (!vehicleModel) continue;
    plans.push({ id: row.id, old: row.customer, customer, vehicleModel });
  }

  console.log(`共 ${rows.length} 条版本，可拆出车型代号 ${plans.length} 条`);

  if (!APPLY) {
    console.log("--- 预览（前 50 条）---");
    for (const p of plans.slice(0, 50)) {
      console.log(`  ${JSON.stringify(p.old)}  →  客户=${JSON.stringify(p.customer)}  代号=${JSON.stringify(p.vehicleModel)}`);
    }
    console.log("（dry-run 未写库。加 --apply 实际执行）");
    db.close();
    return;
  }

  const stmt = db.prepare("UPDATE product_standard_versions SET customer = ?, vehicle_model = ? WHERE id = ?");
  db.transaction(() => {
    for (const p of plans) stmt.run(p.customer, p.vehicleModel, p.id);
  })();
  console.log(`已更新 ${plans.length} 条。`);
  db.close();
}

main();
