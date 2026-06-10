import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createMutex } from "../lib/mutex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir() {
  const envDir = process.env.DATA_DIR;
  if (envDir) return envDir;
  const prodDir = "/var/www/teao-platform/data";
  try {
    if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
    return prodDir;
  } catch {
    const localDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    return localDir;
  }
}

const DATA_DIR = resolveDataDir();
const EMPLOYEES_FILE = path.join(DATA_DIR, "employees.json");
const SEED_FILE = path.join(__dirname, "../data/employees-seed.json");

const empMutex = createMutex();

function generateId() {
  return `emp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calcAge(birthDate) {
  if (!birthDate) return 0;
  const [y, m, d] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

function calcYearsOfService(entryDate) {
  if (!entryDate) return "";
  const [y, m] = entryDate.split("-").map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() + 1 - m;
  if (months < 0) { years--; months += 12; }
  return `${years}年${months}月`;
}

function calcContractRemaining(contractEndDate) {
  if (!contractEndDate) return 0;
  const end = new Date(contractEndDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeEmployee(emp) {
  return {
    ...emp,
    age: calcAge(emp.birthDate),
    contractRemainingDays: calcContractRemaining(emp.contractEndDate),
    yearsOfService: calcYearsOfService(emp.entryDate),
  };
}

function readEmployeesUnsafe() {
  try {
    if (!fs.existsSync(EMPLOYEES_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(EMPLOYEES_FILE, "utf-8"));
    return (data.employees || data).map(normalizeEmployee);
  } catch {
    return [];
  }
}

function writeEmployeesUnsafe(employees) {
  const dir = path.dirname(EMPLOYEES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify({ employees }, null, 2), "utf-8");
}

// Thread-safe wrappers
async function withEmployees(fn) {
  return empMutex.run(async () => {
    const employees = readEmployeesUnsafe();
    const result = await fn(employees);
    writeEmployeesUnsafe(employees);
    return result;
  });
}

export async function initEmployeeData() {
  await empMutex.run(async () => {
    if (readEmployeesUnsafe().length > 0) return;
    try {
      if (!fs.existsSync(SEED_FILE)) {
        console.log("[employees] no seed file, skipping");
        return;
      }
      const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
      const employees = seed.map((emp) => ({
        ...emp,
        id: generateId(),
        createdAt: today(),
        updatedAt: today(),
      }));
      writeEmployeesUnsafe(employees);
      console.log(`[employees] seeded ${employees.length} employees from Excel data`);
    } catch (err) {
      console.error("[employees] seed failed:", err.message);
    }
  });
}

export function listEmployees(status) {
  let list = readEmployeesUnsafe(); // read-only, no lock needed
  if (status === "active") list = list.filter((e) => e.status === "active");
  if (status === "resigned") list = list.filter((e) => e.status === "resigned");
  return list;
}

export function getEmployee(id) {
  return readEmployeesUnsafe().find((e) => e.id === id) || null;
}

export async function createEmployee(data) {
  return withEmployees(async (employees) => {
    if (data.employeeNo && employees.some((e) => e.employeeNo === data.employeeNo)) {
      return { error: `工号 ${data.employeeNo} 已存在` };
    }
    const emp = {
      ...data,
      id: generateId(),
      status: "active",
      createdAt: today(),
      updatedAt: today(),
    };
    employees.push(normalizeEmployee(emp));
    return normalizeEmployee(emp);
  });
}

export async function updateEmployee(id, data) {
  return withEmployees(async (employees) => {
    const idx = employees.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    if (data.employeeNo && employees.some((e) => e.id !== id && e.employeeNo === data.employeeNo)) {
      return { error: `工号 ${data.employeeNo} 已存在` };
    }
    employees[idx] = {
      ...employees[idx],
      ...data,
      id: employees[idx].id,
      updatedAt: today(),
    };
    return normalizeEmployee(employees[idx]);
  });
}

export async function resignEmployee(id) {
  return withEmployees(async (employees) => {
    const idx = employees.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    employees[idx].status = "resigned";
    employees[idx].resignDate = today();
    employees[idx].updatedAt = today();
    return normalizeEmployee(employees[idx]);
  });
}

export function getContractReminders() {
  const employees = readEmployeesUnsafe().filter((e) => e.status === "active");
  const expired = employees.filter((e) => e.contractRemainingDays < 0);
  const expiring = employees.filter((e) => e.contractRemainingDays >= 0 && e.contractRemainingDays <= 60);
  return { expired, expiring, total: employees.length };
}
