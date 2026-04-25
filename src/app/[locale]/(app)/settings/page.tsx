import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function SettingsPlaceholderPage({params}: {params: Promise<{locale: string}>}) {
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
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
    redirect(`/${locale}/welcome`);
  }

  const flags = parsePermissions(profile?.permissions);
  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  if (!isSuper && !flags.can_access_settings) {
    redirect(`/${locale}/dashboard`);
  }

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "SettingsPage"});

  return (
    <DashboardShell
      locale={locale}
      tenantName={tenant?.name ?? "Workspace"}
      currentTenantId={tenantId}
      workspaceTenants={workspaceTenants}
      labels={{
        dashboard: navT("dashboard"),
        members: navT("members"),
        projects: navT("projects"),
        customers: navT("customers"),
        settings: navT("settings"),
        finance: navT("finance"),
        account: navT("account"),
        logout: navT("logout"),
        tenantWorkspace: navT("tenantWorkspace"),
        tenantSwitch: navT("tenantSwitch"),
      }}
    >
      <p className="text-sm text-muted-foreground">{t("placeholder")}</p>
    </DashboardShell>
  );
}
