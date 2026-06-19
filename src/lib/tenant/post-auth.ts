import type {SupabaseClient} from "@supabase/supabase-js";

import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

export type TenantAppAccessState =
  | {ok: true; workspaceId: string}
  | {
      ok: false;
      reason:
        | "password_not_configured"
        | "profile_missing"
        | "profile_error"
        | "workspace_missing"
        | "membership_inactive"
        | "domain_verification_pending";
      workspaceId?: string;
      details?: unknown;
    };

export async function userHasPasswordConfigured(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<boolean> {
  const {data, error} = await supabase.from("profiles").select("password_set_at").eq("id", userId).maybeSingle();
  if (data?.password_set_at) return true;

  if (!error && data) return false;

  // profiles 讀取若被 RLS 或 schema 漂移誤擋，改用 SECURITY DEFINER RPC 判斷登入方式。
  if (userEmail?.trim()) {
    const {data: mode} = await supabase.rpc("auth_login_method", {p_email: userEmail.trim()});
    return mode === "password";
  }

  return false;
}

export async function hasBlockingDomainVerification(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const {data: verifiedDomain} = await supabase
    .from("domain_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();

  if (verifiedDomain) return false;

  const {data: pendingDomain} = await supabase
    .from("domain_verifications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  return Boolean(pendingDomain);
}

/**
 * 是否可進入租戶主應用 `(app)`：已設定登入密碼、有目前工作區、在該租戶為有效成員、且無未完成的網域驗證。
 */
export async function getTenantAppAccessState(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<TenantAppAccessState> {
  if (!(await userHasPasswordConfigured(supabase, userId, userEmail))) {
    return {ok: false, reason: "password_not_configured"};
  }

  const {data: profile, error: profileError} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return {ok: false, reason: "profile_error", details: profileError};
  if (!profile) return {ok: false, reason: "profile_missing"};

  const workspaceId = getWorkspaceTenantId(profile);
  if (!workspaceId) return {ok: false, reason: "workspace_missing"};

  const {data: membership} = await supabase
    .from("tenant_memberships")
    .select("is_active")
    .eq("user_id", userId)
    .eq("tenant_id", workspaceId)
    .maybeSingle();

  if (!membership?.is_active) return {ok: false, reason: "membership_inactive", workspaceId};

  if (await hasBlockingDomainVerification(supabase, userId)) {
    return {ok: false, reason: "domain_verification_pending", workspaceId};
  }

  return {ok: true, workspaceId};
}

export async function canAccessTenantAppShell(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<boolean> {
  const state = await getTenantAppAccessState(supabase, userId, userEmail);
  return state.ok;
}

/** 有效 tenant_memberships 筆數（is_active = true）。 */
export async function countActiveTenantMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const {count, error} = await supabase
    .from("tenant_memberships")
    .select("*", {count: "exact", head: true})
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.warn("countActiveTenantMemberships failed:", error);
    return 0;
  }

  return count ?? 0;
}

/**
 * 登入後導向路徑（052 後以 tenant_memberships 為準，不再依 profiles.tenant_id）。
 * - 未設定密碼 → set-password
 * - 有效 membership = 0 → welcome（全新用戶或尚未加入工作區）
 * - 有效 membership ≥ 1 → App 主殼（/{locale}）
 */
export async function resolvePostLoginHref(
  supabase: SupabaseClient,
  locale: string,
  userId: string,
  userEmail?: string | null,
): Promise<string> {
  if (!(await userHasPasswordConfigured(supabase, userId, userEmail))) {
    return `/${locale}/set-password`;
  }

  const membershipCount = await countActiveTenantMemberships(supabase, userId);
  if (membershipCount >= 1) {
    return `/${locale}`;
  }

  return `/${locale}/welcome`;
}

export async function getPostLoginHref(
  supabase: SupabaseClient,
  locale: string,
  userId: string,
  userEmail?: string | null,
): Promise<string> {
  return resolvePostLoginHref(supabase, locale, userId, userEmail);
}
