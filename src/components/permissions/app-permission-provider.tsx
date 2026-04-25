"use client";

import {useRouter} from "next/navigation";
import {useEffect, useMemo} from "react";

import {createClient} from "@/lib/supabase/client";
import type {PermissionFlags, ProfileRole} from "@/lib/permissions/types";

import {AppPermissionContext, type AppPermissionContextValue} from "./app-permission-context";

type Props = {
  userId: string;
  initialRole: ProfileRole;
  initialPermissions: PermissionFlags;
  isWorkspaceAdmin: boolean;
  children: React.ReactNode;
};

export function AppPermissionProvider({
  userId,
  initialRole,
  initialPermissions,
  isWorkspaceAdmin,
  children,
}: Props) {
  const router = useRouter();

  const value = useMemo<AppPermissionContextValue>(
    () => ({
      userId,
      profileRole: initialRole,
      permissions: initialPermissions,
      isSuperAdmin: initialRole === "super_admin",
      isWorkspaceAdmin,
    }),
    [userId, initialRole, initialPermissions, isWorkspaceAdmin],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`profile-permissions-${userId}`)
      .on(
        "postgres_changes",
        {event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}`},
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return <AppPermissionContext.Provider value={value}>{children}</AppPermissionContext.Provider>;
}
