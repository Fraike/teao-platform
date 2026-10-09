import { listUsers } from "./users.js";

function cleanActorValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getUserDisplayName(user) {
  return cleanActorValue(user?.name) || cleanActorValue(user?.username);
}

export function createProductionActorResolver(users = listUsers()) {
  const namesByIdentity = new Map();

  for (const user of users) {
    const displayName = getUserDisplayName(user);
    if (!displayName) continue;

    for (const identity of [user.id, user.username, user.name]) {
      const key = cleanActorValue(identity);
      if (key) namesByIdentity.set(key, displayName);
    }
  }

  return (actor) => {
    const key = cleanActorValue(actor);
    if (!key) return actor;
    return namesByIdentity.get(key) || actor;
  };
}

export function getProductionActorName(authUser, resolveActor = createProductionActorResolver()) {
  for (const identity of [authUser?.id, authUser?.username]) {
    const key = cleanActorValue(identity);
    if (!key) continue;
    const resolved = resolveActor(key);
    if (resolved !== key) return resolved;
  }

  return cleanActorValue(authUser?.name)
    || cleanActorValue(authUser?.username)
    || "unknown";
}

export function mapProductionRecordActors(record, resolveActor = createProductionActorResolver()) {
  if (!record || typeof record !== "object") return record;
  return {
    ...record,
    createdBy: resolveActor(record.createdBy),
    updatedBy: resolveActor(record.updatedBy),
  };
}

export function mapProductionQueryActors(result, resolveActor = createProductionActorResolver()) {
  if (!result || !Array.isArray(result.groups)) return result;
  return {
    ...result,
    groups: result.groups.map((group) => ({
      ...group,
      records: Array.isArray(group.records)
        ? group.records.map((record) => mapProductionRecordActors(record, resolveActor))
        : group.records,
    })),
  };
}

export function mapProductionHistoryActors(history, resolveActor = createProductionActorResolver()) {
  if (!Array.isArray(history)) return history;
  return history.map((entry) => ({
    ...entry,
    changed_by: resolveActor(entry.changed_by),
  }));
}
