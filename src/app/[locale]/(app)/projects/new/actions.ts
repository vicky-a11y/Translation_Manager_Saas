"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";

import {createClient} from "@/lib/supabase/server";
import {validateFinancialInput} from "@/lib/finance/financial-logic";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";

export type CreateProjectFormState = {
  errorKey?: "auth" | "no_workspace" | "forbidden" | "validation" | "duplicate" | "database";
};

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function normalizeDateTimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function parseMoney(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;

  return amount;
}

export async function createProjectAction(
  _prev: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {errorKey: "auth"};
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
    return {errorKey: "no_workspace"};
  }

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  if (!isSuper && !flags.can_edit_projects) {
    return {errorKey: "forbidden"};
  }

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const projectCode = String(formData.get("project_code") ?? "").trim();
  if (!projectCode || projectCode.length > 50) {
    return {errorKey: "validation"};
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 200) {
    return {errorKey: "validation"};
  }

  const deliveryDeadline = normalizeDateTimeLocal(String(formData.get("delivery_deadline") ?? ""));
  if (!deliveryDeadline) {
    return {errorKey: "validation"};
  }

  const customerId = String(formData.get("customer_id") ?? "").trim();
  if (!customerId) {
    return {errorKey: "validation"};
  }

  const {data: customer} = await supabase
    .from("customer_master")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .eq("is_active", true)
    .maybeSingle();
  if (!customer) {
    return {errorKey: "validation"};
  }

  const totalAmount = parseMoney(formData.get("amount"));
  const disbursementFee = parseMoney(formData.get("disbursement_fee")) ?? 0;
  if (totalAmount == null || disbursementFee == null) {
    return {errorKey: "validation"};
  }

  const financial = validateFinancialInput({
    totalAmount,
    disbursementFee,
    paidAmount: 0,
  });
  if (!financial.ok) {
    return {errorKey: "validation"};
  }

  const {data: project, error} = await supabase
    .from("projects")
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      project_code: projectCode,
      title,
      delivery_deadline: deliveryDeadline,
      source_lang: "und",
      target_lang: "und",
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {errorKey: "duplicate"};
    }
    return {errorKey: "database"};
  }

  const projectId = project?.id as string | undefined;
  if (!projectId) {
    return {errorKey: "database"};
  }

  const {error: financeError, count: financeCount} = await supabase
    .from("project_financials")
    .update(
      {
        amount: financial.breakdown.totalAmount,
        disbursement_fee: financial.breakdown.disbursementFee,
        paid_amount: 0,
      },
      {count: "exact"},
    )
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId);

  if (financeError || financeCount !== 1) {
    await supabase.from("projects").delete().eq("tenant_id", tenantId).eq("id", projectId);
    return {errorKey: "database"};
  }

  revalidatePath(`/${locale}/projects`);
  redirect(`/${locale}/projects`);
}
