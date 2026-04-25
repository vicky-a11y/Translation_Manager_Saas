"use client";

import {useCallback, useContext} from "react";

import {AppPermissionContext} from "@/components/permissions/app-permission-context";

/**
 * 依 profiles.permissions 與 profile_role 動態判斷；super_admin 視為全開。
 */
export function usePermission() {
  const ctx = useContext(AppPermissionContext);
  if (!ctx) {
    throw new Error("usePermission must be used within AppPermissionProvider");
  }

  const can = useCallback(
    (key: keyof typeof ctx.permissions) => {
      if (ctx.isSuperAdmin) return true;
      return Boolean(ctx.permissions[key]);
    },
    [ctx.isSuperAdmin, ctx.permissions],
  );

  return {
    can,
    isSuperAdmin: ctx.isSuperAdmin,
    profileRole: ctx.profileRole,
    isWorkspaceAdmin: ctx.isWorkspaceAdmin,
    /** 成員管理頁（含邀請）是否應顯示於選單 */
    canSeeMembersNav: ctx.isSuperAdmin || ctx.isWorkspaceAdmin || ctx.permissions.can_manage_vendors,
  };
}
