import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { adminAuth, jwtAuth, requirePermission } from '../middleware/jwt-auth.js';
import { getUserById } from '../services/users.js';
import {
  changeCustomerAccountPassword, createCustomerAccount, importCustomerAccounts,
  listCustomerAccountHistory, listCustomerAccounts, readCustomerAccountSource, readSupplementalCustomerCredentials, revealCustomerAccountPassword, revealCustomerAccountPasswords, updateCustomerAccount,
} from '../services/customer-system-accounts.ts';
import { CUSTOMER_ACCOUNT_API, CUSTOMER_ACCOUNT_PERMISSION } from '../shared/customer-system-account.ts';

function sendError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) { next(new Error('客户账号响应中断')); return; }
  const status = error instanceof Error && 'status' in error ? error.status : 500;
  if (status === 400 || status === 404 || status === 409 || status === 503) {
    const parseError = error instanceof SyntaxError;
    res.status(status).json({ error: parseError ? '请求数据格式无效' : (error as Error).message });
    return;
  }
  if (status === 413) {
    res.status(413).json({ error: '请求数据过大' });
    return;
  }
  res.status(500).json({ error: '客户账号操作失败，请稍后重试' });
}

function actorOf(req: Request<{ id: string }>) {
  const { id, username } = (req as typeof req & { user: { id: string; username: string } }).user;
  return { id, name: getUserById(id)?.name || username || id };
}

export function registerCustomerAccountRoutes(app: Express) {
  const router = express.Router();
  const json = express.json({ limit: '8mb' });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(jwtAuth, requirePermission(CUSTOMER_ACCOUNT_PERMISSION));
  router.get('/', (_req, res) => { res.json({ data: listCustomerAccounts() }); });
  router.post('/passwords', json, (req, res) => {
    res.type('json').end(JSON.stringify({ data: revealCustomerAccountPasswords(req.body?.ids) }));
  });
  router.post('/:id/reveal', (req, res) => {
    // Avoid generating an ETag derived from the password response.
    res.type('json').end(JSON.stringify({ data: revealCustomerAccountPassword(req.params.id) }));
  });
  router.post('/', adminAuth, json, (req, res) => { res.status(201).json({ data: createCustomerAccount(req.body) }); });
  router.post('/import', adminAuth, json, (req, res) => { res.json({ data: importCustomerAccounts(req.body?.rows) }); });
  router.put('/:id', adminAuth, json, (req, res) => { res.json({ data: updateCustomerAccount(req.params.id, req.body, actorOf(req)) }); });
  router.put('/:id/password', adminAuth, json, (req, res) => {
    res.json({ data: changeCustomerAccountPassword(req.params.id, req.body, actorOf(req)) });
  });
  router.post('/:id/supplemental-passwords', (req, res) => {
    res.type('json').end(JSON.stringify({ data: readSupplementalCustomerCredentials(req.params.id) }));
  });
  router.post('/:id/source', adminAuth, (req, res) => {
    res.type('json').end(JSON.stringify({ data: readCustomerAccountSource(req.params.id) }));
  });
  router.get('/:id/history', adminAuth, (req, res) => { res.json({ data: listCustomerAccountHistory(req.params.id) }); });
  router.use((_req, res) => { res.status(404).json({ error: '操作不存在' }); });
  router.use(sendError);
  // Mount before the global JSON parser so malformed credential bodies stay inside this router.
  app.use(CUSTOMER_ACCOUNT_API, router);
}
