import {notFound, redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {TranslatorEditor} from "../translator-editor";
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

export default async function TranslatorDetailPage({
  params,
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale: localeParam, id} = await params;
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
  if (!isSuper && !flags.can_manage_vendors) {
    redirect(`/${locale}/dashboard`);
  }

  const {data: translator} = await supabase
    .from("translator_master")
    .select(
      [
        "id",
        "translator_id",
        "name",
        "line_name",
        "email",
        "phone",
        "phone_office",
        "phone_mobile",
        "nationality",
        "gender",
        "id_number",
        "birth_date",
        "marital_status",
        "emergency_phone",
        "address",
        "household_address",
        "mailing_address",
        "education_school_name",
        "education_major",
        "education_degree",
        "native_lang",
        "language_skills",
        "service_tags",
        "bank_name",
        "bank_code",
        "bank_branch",
        "bank_account",
        "bank_account_name",
        "status",
        "created_at",
        "remark",
      ].join(","),
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!translator) {
    notFound();
  }

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
        translators: navT("translators"),
        customers: navT("customers"),
        settings: navT("settings"),
        finance: navT("finance"),
        account: navT("account"),
        logout: navT("logout"),
        tenantWorkspace: navT("tenantWorkspace"),
        tenantSwitch: navT("tenantSwitch"),
      }}
    >
      <TranslatorEditor locale={locale} mode="edit" initial={translator as unknown as Record<string, unknown>} />
    </DashboardShell>
  );
}

