"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import crypto from "node:crypto";

import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";

export type TranslatorFormState = {
  ok?: boolean;
  errorKey?: "auth" | "no_workspace" | "forbidden" | "validation" | "database";
  translatorId?: string;
  errorMessage?: string;
  errorCode?: string;
};

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function normText(value: FormDataEntryValue | null) {
  const t = String(value ?? "").trim();
  return t || null;
}

function normRequired(value: FormDataEntryValue | null) {
  const t = String(value ?? "").trim();
  return t;
}

function normJsonArray(value: FormDataEntryValue | null) {
  try {
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 須與 `service_tag_definitions` / `is_valid_service_tag_array` 一致；至少一筆，不可為空陣列。 */
const ALLOWED_SERVICE_TAGS = new Set(["TR-EN-ZH", "TR-ZH-EN", "TS-ZH", "DTP", "VE"]);

function normServiceTags(value: FormDataEntryValue | null): string[] {
  const picked = normJsonArray(value)
    .map((x) => String(x).trim().toUpperCase())
    .filter((x) => ALLOWED_SERVICE_TAGS.has(x));
  if (picked.length > 0) return picked;
  return ["TR-EN-ZH"];
}

function normalizeDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // Expect YYYY/MM/DD from UI, but tolerate YYYY-MM-DD.
  const normalized = raw.replace(/\//g, "-");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return normalized;
}

async function requireTranslatorManageContext() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return {supabase, user: null, tenantId: null as string | null, locale: defaultLocale, ok: false as const};

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) return {supabase, user, tenantId: null as string | null, locale: defaultLocale, ok: false as const};

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  const allowed = isSuper || flags.can_manage_vendors;
  return {supabase, user, tenantId, locale: defaultLocale, ok: allowed as boolean};
}

export async function createTranslatorAction(_prev: TranslatorFormState, formData: FormData): Promise<TranslatorFormState> {
  const ctx = await requireTranslatorManageContext();
  if (!ctx.user) return {errorKey: "auth"};
  if (!ctx.tenantId) return {errorKey: "no_workspace"};
  if (!ctx.ok) return {errorKey: "forbidden"};

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const translatorId = normText(formData.get("translator_id")) ?? crypto.randomUUID();
  const name = normRequired(formData.get("name"));
  const email = normRequired(formData.get("email"));
  const idNumber = normRequired(formData.get("id_number"));
  const nationality = normRequired(formData.get("nationality"));
  const nativeLang = normRequired(formData.get("native_lang"));
  const bankCode = normRequired(formData.get("bank_code"));
  const bankAccount = normRequired(formData.get("bank_account"));

  if (
    !name ||
    !email ||
    !idNumber ||
    !nationality ||
    !nativeLang ||
    !bankCode ||
    !bankAccount
  ) {
    return {errorKey: "validation"};
  }

  const payload = {
    tenant_id: ctx.tenantId,
    translator_id: translatorId,
    name,
    line_name: normText(formData.get("line_name")),
    email,
    phone: normText(formData.get("phone")),
    phone_office: normText(formData.get("phone_office")),
    phone_mobile: normText(formData.get("phone_mobile")),
    nationality,
    gender: normText(formData.get("gender")),
    id_number: idNumber,
    birth_date: normalizeDate(formData.get("birth_date")),
    marital_status: normText(formData.get("marital_status")),
    emergency_phone: normText(formData.get("emergency_phone")),
    // address（主要地址）已非必填；優先使用 household_address / mailing_address
    address: normText(formData.get("address")),
    household_address: normText(formData.get("household_address")),
    mailing_address: normText(formData.get("mailing_address")),
    education_school_name: normText(formData.get("education_school_name")),
    education_major: normText(formData.get("education_major")),
    education_degree: normText(formData.get("education_degree")),
    native_lang: nativeLang,
    language_skills: normJsonArray(formData.get("language_skills")),
    bank_name: normText(formData.get("bank_name")),
    bank_code: bankCode,
    bank_branch: normText(formData.get("bank_branch")),
    bank_account: bankAccount,
    bank_account_name: normText(formData.get("bank_account_name")),
    remark: normText(formData.get("remark")),
    service_tags: normServiceTags(formData.get("service_tags")),
    status: 2,
  };

  const {data, error} = await ctx.supabase.from("translator_master").insert(payload).select("id").single();
  if (error || !data?.id) {
    return {errorKey: "database", errorMessage: error?.message, errorCode: (error as {code?: string} | null)?.code};
  }

  revalidatePath(`/${locale}/translators`);
  redirect(`/${locale}/translators/${data.id}`);
}

export async function updateTranslatorAction(_prev: TranslatorFormState, formData: FormData): Promise<TranslatorFormState> {
  const ctx = await requireTranslatorManageContext();
  if (!ctx.user) return {errorKey: "auth"};
  if (!ctx.tenantId) return {errorKey: "no_workspace"};
  if (!ctx.ok) return {errorKey: "forbidden"};

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return {errorKey: "validation"};

  const translatorId = normText(formData.get("translator_id")) ?? crypto.randomUUID();
  const name = normRequired(formData.get("name"));
  const email = normRequired(formData.get("email"));
  const idNumber = normRequired(formData.get("id_number"));
  const nationality = normRequired(formData.get("nationality"));
  const nativeLang = normRequired(formData.get("native_lang"));
  const bankCode = normRequired(formData.get("bank_code"));
  const bankAccount = normRequired(formData.get("bank_account"));

  if (
    !name ||
    !email ||
    !idNumber ||
    !nationality ||
    !nativeLang ||
    !bankCode ||
    !bankAccount
  ) {
    return {errorKey: "validation"};
  }

  const payload = {
    translator_id: translatorId,
    name,
    line_name: normText(formData.get("line_name")),
    email,
    phone: normText(formData.get("phone")),
    phone_office: normText(formData.get("phone_office")),
    phone_mobile: normText(formData.get("phone_mobile")),
    nationality,
    gender: normText(formData.get("gender")),
    id_number: idNumber,
    birth_date: normalizeDate(formData.get("birth_date")),
    marital_status: normText(formData.get("marital_status")),
    emergency_phone: normText(formData.get("emergency_phone")),
    address: normText(formData.get("address")),
    household_address: normText(formData.get("household_address")),
    mailing_address: normText(formData.get("mailing_address")),
    education_school_name: normText(formData.get("education_school_name")),
    education_major: normText(formData.get("education_major")),
    education_degree: normText(formData.get("education_degree")),
    native_lang: nativeLang,
    language_skills: normJsonArray(formData.get("language_skills")),
    bank_name: normText(formData.get("bank_name")),
    bank_code: bankCode,
    bank_branch: normText(formData.get("bank_branch")),
    bank_account: bankAccount,
    bank_account_name: normText(formData.get("bank_account_name")),
    remark: normText(formData.get("remark")),
    service_tags: normServiceTags(formData.get("service_tags")),
  };

  const {error} = await ctx.supabase
    .from("translator_master")
    .update(payload)
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);
  if (error) return {errorKey: "database", errorMessage: error.message, errorCode: (error as {code?: string}).code};

  revalidatePath(`/${locale}/translators`);
  revalidatePath(`/${locale}/translators/${id}`);
  return {ok: true};
}

export async function disableTranslatorAction(formData: FormData): Promise<{ok: boolean}> {
  const ctx = await requireTranslatorManageContext();
  if (!ctx.user || !ctx.tenantId || !ctx.ok) return {ok: false};
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return {ok: false};

  const {error} = await ctx.supabase
    .from("translator_master")
    .update({status: 3})
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);
  return {ok: !error};
}

export async function deleteTranslatorAction(formData: FormData): Promise<{ok: boolean}> {
  const ctx = await requireTranslatorManageContext();
  if (!ctx.user || !ctx.tenantId || !ctx.ok) return {ok: false};
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return {ok: false};

  const {error} = await ctx.supabase.from("translator_master").delete().eq("tenant_id", ctx.tenantId).eq("id", id);
  return {ok: !error};
}

