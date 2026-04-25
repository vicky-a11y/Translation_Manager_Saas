"use server";

import {createClient} from "@/lib/supabase/server";
import {getPostLoginHref} from "@/lib/tenant/post-auth";

/** 登入成功後（客戶端）呼叫，以取得應導向的路徑。 */
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

  return getPostLoginHref(supabase, trimmed, user.id, user.email);
}
