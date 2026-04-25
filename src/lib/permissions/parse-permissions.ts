import {DEFAULT_PERMISSION_FLAGS, type PermissionFlags, PERMISSION_KEYS} from "@/lib/permissions/types";

export function parsePermissions(raw: unknown): PermissionFlags {
  const next: PermissionFlags = {...DEFAULT_PERMISSION_FLAGS};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return next;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of PERMISSION_KEYS) {
    const v = obj[key];
    if (typeof v === "boolean") {
      next[key] = v;
    }
  }
  const legacy = obj["can_manage_translators"];
  if (typeof legacy === "boolean" && typeof obj["can_manage_vendors"] !== "boolean") {
    next.can_manage_vendors = legacy;
  }
  return next;
}
