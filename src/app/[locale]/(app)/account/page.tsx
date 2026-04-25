import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {AccountClient} from "@/app/[locale]/(app)/account/account-client";
import {DashboardShell} from "@/components/layout/dashboard-shell";
import {createClient} from "@/lib/supabase/server";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {userHasPasswordConfigured} from "@/lib/tenant/post-auth";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function AccountPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (!(await userHasPasswordConfigured(supabase, user.id, user.email))) {
    redirect(`/${locale}/set-password`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select(
      "tenant_id, active_tenant_id, full_name, nickname, gender, phone, address, region, timezone, language_preference, password_set_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect(`/${locale}/welcome`);
  }

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
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
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!activeMembership?.is_active) {
    redirect(`/${locale}/welcome`);
  }

  const {data: priv} = await supabase.from("profile_private").select("real_name").eq("user_id", user.id).maybeSingle();

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const navT = await getTranslations({locale, namespace: "Navigation"});

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
      <AccountClient
        locale={locale}
        userEmail={user.email ?? ""}
        initial={{
          full_name: profile?.full_name ?? null,
          nickname: profile?.nickname ?? null,
          gender: profile?.gender ?? null,
          phone: profile?.phone ?? null,
          address: profile?.address ?? null,
          region: profile?.region ?? null,
          timezone: profile?.timezone ?? null,
          language_preference: profile?.language_preference ?? "zh-TW",
          real_name: priv?.real_name ?? null,
          password_set_at: profile?.password_set_at ?? null,
        }}
      />
    </DashboardShell>
  );
}
