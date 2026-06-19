"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {createCustomerMasterRepository} from "@/lib/repositories/customer-master-repository";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";

type AdminStatus = "generated" | "revoked" | "deleted" | "forbidden" | "error" | "duplicate_tax";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function backWithStatus(locale: AppLocale, status: AdminStatus): never {
  redirect(`/${locale}/customers/intake?status=${status}`);
}

async function requireEditor(locale: AppLocale) {
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
    backWithStatus(locale, "forbidden");
  }

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  if (!isSuper && !flags.can_edit_projects) {
    backWithStatus(locale, "forbidden");
  }

  return {supabase, user, tenantId};
}

export async function createIntakeLink(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const label = String(formData.get("label") ?? "").trim().slice(0, 200) || null;

  const {supabase, user, tenantId} = await requireEditor(locale);

  const {error} = await supabase.from("customer_intake_links").insert({
    tenant_id: tenantId,
    label,
    created_by: user.id,
    is_active: true,
  });

  if (error) {
    backWithStatus(locale, "error");
  }
  revalidatePath(`/${locale}/customers/intake`, "page");
  backWithStatus(locale, "generated");
}

export async function revokeIntakeLink(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const linkId = String(formData.get("link_id") ?? "").trim();
  if (!linkId) {
    backWithStatus(locale, "error");
  }

  const {supabase, tenantId} = await requireEditor(locale);

  const {error} = await supabase
    .from("customer_intake_links")
    .update({is_active: false})
    .eq("tenant_id", tenantId)
    .eq("id", linkId);

  if (error) {
    backWithStatus(locale, "error");
  }
  revalidatePath(`/${locale}/customers/intake`, "page");
  backWithStatus(locale, "revoked");
}

export async function deleteIntakeSubmission(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  if (!submissionId) {
    backWithStatus(locale, "error");
  }

  const {supabase, tenantId} = await requireEditor(locale);

  const {error} = await supabase
    .from("customer_intake_submissions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", submissionId);

  if (error) {
    backWithStatus(locale, "error");
  }
  revalidatePath(`/${locale}/customers/intake`, "page");
  backWithStatus(locale, "deleted");
}

/** 轉正：建立客戶主檔，並導向預填的新增案件頁。 */
export async function approveIntakeSubmission(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  if (!submissionId) {
    backWithStatus(locale, "error");
  }

  const {supabase, user, tenantId} = await requireEditor(locale);

  const {data: sub} = await supabase
    .from("customer_intake_submissions")
    .select(
      "id, status, customer_name, phone, email, address, has_tax_invoice, tax_title, tax_id, created_customer_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", submissionId)
    .maybeSingle();

  if (!sub) {
    backWithStatus(locale, "error");
  }

  // 已轉正過：直接導向預填頁，不重複建立。
  if (sub.status === "approved" && sub.created_customer_id) {
    redirect(`/${locale}/projects/new?from_intake=${submissionId}`);
  }

  const repo = createCustomerMasterRepository({supabase, tenantId});

  const taxTitle = (sub.tax_title ?? "").trim();
  const customerName = (sub.customer_name ?? "").trim();
  const displayName = (customerName || taxTitle).slice(0, 100) || "—";
  const legalName = (taxTitle || customerName).slice(0, 200) || null;
  const taxId = sub.has_tax_invoice ? (sub.tax_id ?? "").trim() || null : null;

  if (taxId) {
    const dup = await repo.findDuplicateTaxIdId(taxId.toLowerCase());
    if (dup) {
      backWithStatus(locale, "duplicate_tax");
    }
  }

  const {data: inserted, error} = await repo.insert({
    display_name: displayName,
    legal_name: legalName,
    tax_id: taxId,
    invoice_type: sub.has_tax_invoice ? 2 : null,
    email: (sub.email ?? "").trim() || null,
    phone_mobile: (sub.phone ?? "").trim() || null,
    address: (sub.address ?? "").trim() || null,
    status: 1,
    is_active: true,
  });

  if (error || !inserted?.id) {
    backWithStatus(locale, "error");
  }

  const customerId = String(inserted.id);

  const {error: updErr} = await supabase
    .from("customer_intake_submissions")
    .update({
      status: "approved",
      created_customer_id: customerId,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", submissionId);

  if (updErr) {
    // 客戶已建立，但狀態回寫失敗：仍導向建案頁，避免阻斷流程。
    console.error("approveIntakeSubmission status update failed:", updErr);
  }

  revalidatePath(`/${locale}/customers/intake`, "page");
  redirect(`/${locale}/projects/new?from_intake=${submissionId}`);
}
