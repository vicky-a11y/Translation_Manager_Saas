import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {ProjectNewForm, type IntakeReference} from "./project-new-form";
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

export default async function ProjectNewPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{from_intake?: string}>;
}) {
  const {locale: localeParam} = await params;
  const {from_intake: fromIntake} = await searchParams;
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

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const {count: activeCustomerCount} = await supabase
    .from("customer_master")
    .select("id", {count: "exact", head: true})
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const navT = await getTranslations({locale, namespace: "Navigation"});

  let initialCustomer: {id: string; label: string} | null = null;
  let initialAmount: string | null = null;
  let reference: IntakeReference | null = null;

  if (fromIntake) {
    const {data: sub} = await supabase
      .from("customer_intake_submissions")
      .select(
        "created_customer_id, project_type_note, intake_channel, remittance_amount, remittance_bank_name, remittance_account_last5, has_tax_invoice, tax_title, tax_id, address, need_shipping, shipping_name, shipping_phone, shipping_zipcode, shipping_address",
      )
      .eq("tenant_id", tenantId)
      .eq("id", fromIntake)
      .eq("status", "approved")
      .maybeSingle();

    if (sub?.created_customer_id) {
      const {data: cust} = await supabase
        .from("customer_master")
        .select("id, display_name, cid")
        .eq("tenant_id", tenantId)
        .eq("id", sub.created_customer_id)
        .maybeSingle();

      if (cust) {
        initialCustomer = {
          id: String(cust.id),
          label: cust.cid ? `${cust.display_name} (${cust.cid})` : String(cust.display_name),
        };
      }
      initialAmount = sub.remittance_amount != null ? String(sub.remittance_amount) : null;
      const shipping = sub.need_shipping
        ? [sub.shipping_name, sub.shipping_phone, sub.shipping_zipcode, sub.shipping_address]
            .filter((v) => v && String(v).trim())
            .join(" / ")
        : null;
      reference = {
        projectType: sub.project_type_note,
        channel: sub.intake_channel,
        remittanceAmount: sub.remittance_amount,
        remittanceBank: sub.remittance_bank_name,
        remittanceLast5: sub.remittance_account_last5,
        hasTaxInvoice: sub.has_tax_invoice,
        taxTitle: sub.tax_title,
        taxId: sub.tax_id,
        address: sub.address,
        shipping: shipping || null,
      };
    }
  }

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
      <ProjectNewForm
        locale={locale}
        hasCustomers={(activeCustomerCount ?? 0) > 0}
        initialCustomer={initialCustomer}
        initialAmount={initialAmount}
        reference={reference}
      />
    </DashboardShell>
  );
}
