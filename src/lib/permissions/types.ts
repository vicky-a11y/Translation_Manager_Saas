export const PERMISSION_KEYS = [
  "can_view_finance",
  "can_edit_projects",
  "can_manage_vendors",
  "can_assign_tasks",
  "can_access_settings",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionFlags = Record<PermissionKey, boolean>;

export const DEFAULT_PERMISSION_FLAGS: PermissionFlags = {
  can_view_finance: false,
  can_edit_projects: true,
  can_manage_vendors: false,
  can_assign_tasks: false,
  can_access_settings: false,
};

export type ProfileRole = "super_admin" | "tenant_owner" | "staff" | "vendor";
