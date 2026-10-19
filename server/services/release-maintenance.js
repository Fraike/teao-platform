import fs from "node:fs";

export function isReleaseMaintenance() {
  return fs.existsSync(process.env.TEAO_RELEASE_MAINTENANCE_FILE || "/var/lib/teao-platform/releases/maintenance");
}
