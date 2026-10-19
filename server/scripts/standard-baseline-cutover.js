#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { previewBaselineCutover, applyBaselineCutover, rollbackBaselineCutover } from '../services/standard-baseline-cutover.js';

const usage = `Offline standard baseline cutover (Node 24+, root + lsof required)
preview --target /absolute/standards.db --staged /absolute/standards.db --archive-root /absolute/existing-dir --maintenance-file /absolute/existing-flag [--service teao-api]
apply   same options + --fingerprint PREVIEW_SHA256
rollback --target /absolute/standards.db --archive /absolute/cutover-dir --maintenance-file /absolute/existing-flag [--service teao-api] --fingerprint ROLLBACK_SHA256
Does not stop/start services or remove maintenance. No force/dry-run bypass.`;

export function runBaselineCutoverCLI(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: usage };
  const [command, ...flags] = args;
  const commands = { preview: previewBaselineCutover, apply: applyBaselineCutover, rollback: rollbackBaselineCutover };
  if (!Object.hasOwn(commands, command)) throw new Error(usage);
  const allowed = command === 'rollback' ? ['target', 'archive', 'maintenance-file', 'service', 'fingerprint']
    : ['target', 'staged', 'archive-root', 'maintenance-file', 'service', ...(command === 'apply' ? ['fingerprint'] : [])];
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i];
    if (!flag.startsWith('--') || !allowed.includes(flag.slice(2)) || !flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error('invalid option; ' + usage);
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(options, key)) throw new Error('duplicate option: ' + flag);
    options[key] = flags[i + 1];
  }
  const required = allowed.filter(key => key !== 'service');
  if (required.some(key => !Object.hasOwn(options, key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())))) throw new Error('missing option; ' + usage);
  return commands[command](options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runBaselineCutoverCLI(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
