"use server";

import {revalidatePath} from "next/cache";

import {createClient} from "@/lib/supabase/server";

const LANGS = new Set(["zh-TW", "zh-CN", "en", "ms"]);
const GENDERS = new Set(["male", "female", "undisclosed"]);

export type SaveAccountProfileResult =
  | {ok: true}
  | {ok: false; code: "auth" | "validation" | "db"};

export async function saveAccountProfile(formData: FormData): Promise<SaveAccountProfileResult> {
  const locale = String(formData.get("locale") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const languagePreference = String(formData.get("language_preference") ?? "zh-TW").trim();
  const realName = String(formData.get("real_name") ?? "").trim();

  if (!locale) {
    return {ok: false, code: "validation"};
  }

  if (!LANGS.has(languagePreference)) {
    return {ok: false, code: "validation"};
  }

  const gender = genderRaw === "" ? null : genderRaw;
  if (gender !== null && !GENDERS.has(gender)) {
    return {ok: false, code: "validation"};
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, code: "auth"};
  }

  const {error: profileError} = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      nickname: nickname || null,
      gender,
      phone: phone || null,
      address: address || null,
      region: region || null,
      timezone: timezone || null,
      language_preference: languagePreference,
    })
    .eq("id", user.id);

  if (profileError) {
    return {ok: false, code: "db"};
  }

  const {error: privateError} = await supabase.from("profile_private").upsert(
    {
      user_id: user.id,
      real_name: realName || null,
      updated_at: new Date().toISOString(),
    },
    {onConflict: "user_id"},
  );

  if (privateError) {
    return {ok: false, code: "db"};
  }

  revalidatePath(`/${locale}/account`, "page");
  revalidatePath(`/${locale}`, "layout");
  return {ok: true};
}

export type MarkPasswordSetResult =
  | {ok: true}
  | {ok: false; code: "validation" | "auth" | "rpc" | "update"; message?: string};

export async function markPasswordSet(locale: string): Promise<MarkPasswordSetResult> {
  const localeTrim = locale.trim();
  if (!localeTrim) return {ok: false, code: "validation"};

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return {ok: false, code: "auth"};

  // 優先走 SECURITY DEFINER RPC（migration 033），繞過 profiles_update_own RLS 的
  // active_tenant_id / tenant_memberships 連動檢查，避免新註冊使用者卡在 set-password。
  const {error: rpcError} = await supabase.rpc("mark_password_set");

  if (!rpcError) {
    revalidatePath(`/${localeTrim}/account`, "page");
    return {ok: true};
  }

  // Fallback：若 DB 尚未套用 033（例如本機未執行 migration），退回直接 UPDATE；
  // 失敗時將完整錯誤訊息帶回前端，方便第一現場診斷。
  const {error: updateError} = await supabase
    .from("profiles")
    .update({password_set_at: new Date().toISOString()})
    .eq("id", user.id);

  if (updateError) {
    const detail = `${rpcError.message} / ${updateError.message}`;
    return {ok: false, code: "update", message: detail};
  }

  revalidatePath(`/${localeTrim}/account`, "page");
  return {ok: true};
}
