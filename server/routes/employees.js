import {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, resignEmployee, getContractReminders, replaceEmployees,
} from "../services/employees.js";
import { setUserWecomUserid } from "../services/users.js";
import { organizationStore } from "./organization.ts";
import { jwtAuth, requirePermission, requireAnyPermission } from "../middleware/jwt-auth.js";

export function registerEmployeeRoutes(app) {
  const hrAuth = requirePermission("hr");
  app.get("/api/employees", jwtAuth, hrAuth, (req, res) => {
    const { status } = req.query;
    res.json(listEmployees(status || null));
  });

  app.get("/api/employees/active-names", jwtAuth, requireAnyPermission(["hr", "production"]), (_req, res) => {
    res.json(listEmployees("active").map(({ name }) => ({ name })));
  });

  app.get("/api/employees/reminders", jwtAuth, hrAuth, (_req, res) => {
    res.json(getContractReminders());
  });

  app.get("/api/employees/:id", jwtAuth, hrAuth, (req, res) => {
    const emp = getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });

  app.post("/api/employees/import", jwtAuth, hrAuth, async (req, res) => {
    try {
      const result = await replaceEmployees(req.body?.records);
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "导入失败" });
    }
  });

  app.post("/api/employees", jwtAuth, hrAuth, async (req, res) => {
    const { wecomBinding, wecomUserid, ...data } = req.body ?? {};
    if (wecomBinding !== undefined || wecomUserid !== undefined) {
      return res.status(400).json({ error: "请在关联平台账号后编辑企业微信账号" });
    }
    if (!data.name || !data.department || !data.position) {
      return res.status(400).json({ error: "姓名、部门、职位为必填项" });
    }
    const emp = await createEmployee(data);
    if (emp.error) return res.status(400).json({ error: emp.error });
    res.status(201).json(emp);
  });

  app.put("/api/employees/:id", jwtAuth, hrAuth, async (req, res) => {
    const { wecomBinding, wecomUserid, ...data } = req.body ?? {};
    if (wecomBinding !== undefined || wecomUserid !== undefined) {
      if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可以修改企业微信账号" });
      if (!wecomBinding || typeof wecomBinding.userId !== "string" || typeof wecomBinding.value !== "string") {
        return res.status(400).json({ error: "企业微信账号参数无效" });
      }
    }
    const persistEdit = (previous, next, save) => {
      const organization = organizationStore();
      const commit = () => organization.commitEmployeeEdit(previous, next, save);
      if (!wecomBinding) {
        commit();
        return {};
      }
      return setUserWecomUserid(wecomBinding.userId, wecomBinding.value, {
        isCurrent: () => organization.employeeAccount(previous.id)?.id === wecomBinding.userId,
        commit,
      });
    };
    try {
      const emp = await updateEmployee(req.params.id, data, persistEdit);
      if (!emp) return res.status(404).json({ error: "员工不存在" });
      if (emp.error) return res.status(emp.status || 400).json({ error: emp.error });
      res.json(emp);
    } catch (error) {
      const status = error.status === 409 ? 409 : 500;
      res.status(status).json({ error: status === 409 ? error.message : "保存员工信息失败，请稍后重试" });
    }
  });

  app.delete("/api/employees/:id", jwtAuth, hrAuth, async (req, res) => {
    const emp = await resignEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "员工不存在" });
    res.json(emp);
  });
}
