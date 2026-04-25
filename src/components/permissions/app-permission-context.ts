"use client";

import {createContext} from "react";

import type {PermissionFlags, ProfileRole} from "@/lib/permissions/types";

export type AppPermissionContextValue = {
  userId: string;
  profileRole: ProfileRole;
  permissions: PermissionFlags;
  isSuperAdmin: boolean;
  isWorkspaceAdmin: boolean;
};

export const AppPermissionContext = createContext<AppPermissionContextValue | null>(null);
