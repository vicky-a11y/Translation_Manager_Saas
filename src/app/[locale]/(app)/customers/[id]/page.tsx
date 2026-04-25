import {notFound, redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {CustomerDetailForm, type CustomerDetailDTO} from "./customer-detail-form";
import {DashboardShell} from "@/components/layout/dashboard-shell";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {createCustomerMasterRepository} from "@/lib/repositories/customer-master-repository";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapCustomerRow(row: Record<string, unknown>): CustomerDetailDTO {
  return {
    id: String(row.id),
    cid: row.cid != null ? String(row.cid) : null,
    customer_type: numOrNull(row.customer_type),
    legal_name: row.legal_name != null ? String(row.legal_name) : null,
    display_name: String(row.display_name ?? ""),
    tax_id: row.tax_id != null ? String(row.tax_id) : null,
    invoice_type: numOrNull(row.invoice_type),
    country_code: row.country_code != null ? String(row.country_code) : null,
    status: numOrNull(row.status) ?? 1,
    contact_person: row.contact_person != null ? String(row.contact_person) : null,
    email: row.email != null ? String(row.email) : null,
    phone_mobile: row.phone_mobile != null ? String(row.phone_mobile) : null,
    phone_office: row.phone_office != null ? String(row.phone_office) : null,
    address: row.address != null ? String(row.address) : null,
    remark: row.remark != null ? String(row.remark) : null,
    im_platform: row.im_platform != null ? String(row.im_platform) : null,
    im_id: row.im_id != null ? String(row.im_id) : null,
    internal_tags: row.internal_tags != null ? String(row.internal_tags) : null,
    is_active: row.is_active === false ? false : true,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale: localeParam, id: customerId} = await params;
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
  if (!isSuper && !flags.can_edit_projects) {
    redirect(`/${locale}/dashboard`);
  }

  const repo = createCustomerMasterRepository({supabase, tenantId});
  const {data: row} = await repo.getById(customerId);

  if (!row) {
    notFound();
  }

  const customer = mapCustomerRow(row as unknown as Record<string, unknown>);

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
      <CustomerDetailForm key={customer.updated_at} locale={locale} customer={customer} />
    </DashboardShell>
  );
}
