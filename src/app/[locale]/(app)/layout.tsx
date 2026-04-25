import {redirect} from "next/navigation";

import {AppPermissionProvider} from "@/components/permissions/app-permission-provider";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, password_set_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect(`/${locale}/welcome`);
  }

  if (!profile.password_set_at) {
    redirect(`/${locale}/set-password`);
  }

  const workspaceId = getWorkspaceTenantId(profile);

  if (!workspaceId) {
    redirect(`/${locale}/welcome`);
  }

  const {data: pendingDomain} = await supabase
    .from("domain_verifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (pendingDomain) {
    redirect(`/${locale}/welcome`);
  }

  const {data: activeMembership} = await supabase
    .from("tenant_memberships")
    .select("is_active")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceId)
    .maybeSingle();

  if (!activeMembership?.is_active) {
    redirect(`/${locale}/welcome`);
  }

  const {data: fullProfile} = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const {data: workspaceMembership} = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  const isWorkspaceAdmin =
    workspaceMembership?.role === "owner" || workspaceMembership?.role === "admin";

  return (
    <AppPermissionProvider
      userId={user.id}
      initialRole={(fullProfile?.role as ProfileRole | undefined) ?? "staff"}
      initialPermissions={parsePermissions(fullProfile?.permissions)}
      isWorkspaceAdmin={isWorkspaceAdmin}
    >
      {children}
    </AppPermissionProvider>
  );
}
