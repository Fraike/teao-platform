import type { User } from "../types/auth";
import type { StandardDraftAction, StandardListItem } from "../types/standard";

export function getStandardDraftAction(
  version: Pick<StandardListItem, "status" | "createdById" | "submittedById">,
  user: Pick<User, "id" | "role"> | null,
): StandardDraftAction | null {
  if (!user?.id) return null;
  if (version.status === "pending_review") return version.submittedById === user.id ? "withdraw" : null;
  if (version.status !== "draft") return null;
  return user.role === "admin" || version.createdById === user.id || version.submittedById === user.id ? "discard-draft" : null;
}
