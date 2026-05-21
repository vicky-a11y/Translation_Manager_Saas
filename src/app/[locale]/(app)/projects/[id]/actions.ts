"use server";

import {revalidatePath} from "next/cache";

import {validateFinancialInput, PAYMENT_METHOD} from "@/lib/finance/financial-logic";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {createClient} from "@/lib/supabase/server";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function parseMoney(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return amount;
}

function normText(value: FormDataEntryValue | null) {
  const t = String(value ?? "").trim();
  return t || null;
}

function normBool(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}

function sanitizeDigits(value: string | null) {
  if (!value) return null;
  const t = value.replace(/\s+/g, "");
  return t || null;
}

async function requireProjectEditContext() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return {supabase, user: null, tenantId: null as string | null, ok: false as const, locale: defaultLocale};

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) return {supabase, user, tenantId: null as string | null, ok: false as const, locale: defaultLocale};

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  const ok = isSuper || flags.can_edit_projects;
  return {supabase, user, tenantId, ok, locale: defaultLocale};
}

export type UpdateProjectFinanceState = {
  ok?: boolean;
  errorKey?: "auth" | "no_workspace" | "forbidden" | "validation" | "database" | "not_found";
};

export async function updateProjectFinanceAction(
  _prev: UpdateProjectFinanceState,
  formData: FormData,
): Promise<UpdateProjectFinanceState> {
  const ctx = await requireProjectEditContext();
  if (!ctx.user) return {errorKey: "auth"};
  if (!ctx.tenantId) return {errorKey: "no_workspace"};
  if (!ctx.ok) return {errorKey: "forbidden"};

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId) return {errorKey: "validation"};

  const paidAmount = parseMoney(formData.get("paid_amount"));
  if (paidAmount == null) return {errorKey: "validation"};

  const paymentMethodRaw = String(formData.get("payment_method") ?? "").trim();
  const paymentMethod = paymentMethodRaw ? Number(paymentMethodRaw) : null;
  if (paymentMethodRaw && !Number.isFinite(paymentMethod)) return {errorKey: "validation"};

  // 讀取既有 amount / disbursement_fee 作為校驗基礎（避免 UI 改欄位不同步）
  const {data: fin} = await ctx.supabase
    .from("project_financials")
    .select("amount, disbursement_fee")
    .eq("tenant_id", ctx.tenantId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!fin) return {errorKey: "not_found"};

  const v = validateFinancialInput({
    totalAmount: Number(fin.amount ?? 0),
    disbursementFee: Number(fin.disbursement_fee ?? 0),
    paidAmount,
    paymentMethod,
  });
  if (!v.ok) return {errorKey: "validation"};

  const remittanceBankName = normText(formData.get("remittance_bank_name"));
  const remittanceAccountLast5 = sanitizeDigits(normText(formData.get("remittance_account_last5")));
  const remittanceIsCounter = normBool(formData.get("remittance_is_counter"));
  const paymentNote = normText(formData.get("payment_note"));

  if (paymentMethod === PAYMENT_METHOD.BANK_TRANSFER) {
    if (!remittanceBankName || !remittanceAccountLast5 || !/^\d{5}$/.test(remittanceAccountLast5)) {
      return {errorKey: "validation"};
    }
  }

  const updatePayload = {
    paid_amount: v.breakdown.paidAmount,
    payment_method: paymentMethod,
    last_paid_at: v.breakdown.paidAmount > 0 ? new Date().toISOString() : null,
    remittance_bank_name: paymentMethod === PAYMENT_METHOD.BANK_TRANSFER ? remittanceBankName : null,
    remittance_account_last5: paymentMethod === PAYMENT_METHOD.BANK_TRANSFER ? remittanceAccountLast5 : null,
    remittance_is_counter: paymentMethod === PAYMENT_METHOD.BANK_TRANSFER ? remittanceIsCounter : null,
    payment_note: paymentMethod === PAYMENT_METHOD.OTHER ? paymentNote : null,
  };

  const {error, count} = await ctx.supabase
    .from("project_financials")
    .update(updatePayload, {count: "exact"})
    .eq("tenant_id", ctx.tenantId)
    .eq("project_id", projectId);
  if (error || count !== 1) return {errorKey: "database"};

  revalidatePath(`/${locale}/projects/${projectId}`);
  return {ok: true};
}

export type TranslatorSearchOption = {
  translatorId: string;
  label: string;
};

function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_]/g, "").slice(0, 80);
}

export async function searchActiveTranslatorsAction(query: string): Promise<TranslatorSearchOption[]> {
  const term = sanitizeSearchTerm(query);
  if (term.length < 1) return [];

  const ctx = await requireProjectEditContext();
  if (!ctx.user || !ctx.tenantId || !ctx.ok) return [];

  const pattern = `%${term}%`;
  const base = () =>
    ctx.supabase
      .from("translator_master")
      .select("translator_id, name, line_name")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", 2);

  const [byName, byLine, byId] = await Promise.all([
    base().ilike("name", pattern).limit(15),
    base().not("line_name", "is", null).ilike("line_name", pattern).limit(15),
    base().ilike("translator_id", pattern).limit(15),
  ]);

  const seen = new Set<string>();
  const rows = [...(byName.data ?? []), ...(byLine.data ?? []), ...(byId.data ?? [])] as Array<{
    translator_id: string;
    name: string | null;
    line_name: string | null;
  }>;

  const out: TranslatorSearchOption[] = [];
  for (const r of rows) {
    const id = String(r.translator_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const display = String((r.line_name ?? "").trim() || (r.name ?? "").trim() || id);
    out.push({translatorId: id, label: `${display}（${id}）`});
  }
  return out.slice(0, 25);
}

export type UpsertAssignmentState = {
  ok?: boolean;
  errorKey?: "auth" | "no_workspace" | "forbidden" | "validation" | "database" | "not_found";
  assignmentId?: string;
};

function normalizeDateTimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function upsertProjectTranslatorAssignmentAction(
  _prev: UpsertAssignmentState,
  formData: FormData,
): Promise<UpsertAssignmentState> {
  const ctx = await requireProjectEditContext();
  if (!ctx.user) return {errorKey: "auth"};
  if (!ctx.tenantId) return {errorKey: "no_workspace"};
  if (!ctx.ok) return {errorKey: "forbidden"};

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const projectId = String(formData.get("project_id") ?? "").trim();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim() || null;
  const assigneeId = String(formData.get("assignee_id") ?? "").trim();
  const translatorFee = parseMoney(formData.get("translator_fee"));
  const translatorDeadline = normalizeDateTimeLocal(String(formData.get("translator_deadline") ?? ""));

  if (!projectId || !assigneeId || translatorFee == null) return {errorKey: "validation"};

  // 若未提供 service_tag，使用保守預設 TR-EN-ZH（系統預設 seed）
  const serviceTag = String(formData.get("service_tag") ?? "").trim() || "TR-EN-ZH";

  const payload = {
    tenant_id: ctx.tenantId,
    project_id: projectId,
    assignee_id: assigneeId,
    service_tag: serviceTag,
    translator_fee: Math.round(translatorFee),
    translator_deadline: translatorDeadline,
  };

  if (assignmentId) {
    const {error, count} = await ctx.supabase
      .from("project_translator_assignments")
      .update(payload, {count: "exact"})
      .eq("tenant_id", ctx.tenantId)
      .eq("project_id", projectId)
      .eq("id", assignmentId);
    if (error || (count ?? 0) < 1) return {errorKey: "database"};
    revalidatePath(`/${locale}/projects/${projectId}`);
    return {ok: true, assignmentId};
  }

  const {data, error} = await ctx.supabase
    .from("project_translator_assignments")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) return {errorKey: "database"};

  revalidatePath(`/${locale}/projects/${projectId}`);
  return {ok: true, assignmentId: String(data.id)};
}

export async function deleteProjectTranslatorAssignmentAction(formData: FormData): Promise<{ok: boolean}> {
  const ctx = await requireProjectEditContext();
  if (!ctx.user || !ctx.tenantId || !ctx.ok) return {ok: false};

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const projectId = String(formData.get("project_id") ?? "").trim();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  if (!projectId || !assignmentId) return {ok: false};

  const {error} = await ctx.supabase
    .from("project_translator_assignments")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("project_id", projectId)
    .eq("id", assignmentId);

  if (error) return {ok: false};
  revalidatePath(`/${locale}/projects/${projectId}`);
  return {ok: true};
}

