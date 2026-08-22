import {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, resignEmployee, getContractReminders, replaceEmployees,
} from "../services/employees.js";
import { jwtAuth } from "../middleware/jwt-auth.js";

export function registerEmployeeRoutes(app) {
  app.get("/api/employees", jwtAuth, (req, res) => {
    const { status } = req.query;
    res.json(listEmployees(status || null));
  });

  app.get("/api/employees/reminders", jwtAuth, (_req, res) => {
    res.json(getContractReminders());
  });

  app.get("/api/employees/:id", jwtAuth, (req, res) => {
    const emp = getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });

  app.post("/api/employees/import", jwtAuth, async (req, res) => {
    try {
      const result = await replaceEmployees(req.body?.records);
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "导入失败" });
    }
  });

  app.post("/api/employees", jwtAuth, async (req, res) => {
    const data = req.body;
    if (!data.name || !data.department || !data.position) {
      return res.status(400).json({ error: "姓名、部门、职位为必填项" });
    }
    const emp = await createEmployee(data);
    if (emp.error) return res.status(400).json({ error: emp.error });
    res.status(201).json(emp);
  });

  app.put("/api/employees/:id", jwtAuth, async (req, res) => {
    const emp = await updateEmployee(req.params.id, req.body);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    if (emp.error) return res.status(400).json({ error: emp.error });
    res.json(emp);
  });

  app.delete("/api/employees/:id", jwtAuth, async (req, res) => {
    const emp = await resignEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });
}
