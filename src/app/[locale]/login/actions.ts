"use server";

import {createClient} from "@/lib/supabase/server";
import {resolvePostLoginHref} from "@/lib/tenant/post-auth";

/**
 * 登入成功後（客戶端）呼叫，依 tenant_memberships 數量決定導向：
 * 0 筆 → /welcome；≥ 1 筆 → App 主殼 /{locale}。
 */
export async function getPostLoginTargetAction(locale: string): Promise<string> {
  const trimmed = locale.trim();
  if (!trimmed) return "/";

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) {
    return `/${trimmed}/login`;
  }

  return resolvePostLoginHref(supabase, trimmed, user.id, user.email);
}
