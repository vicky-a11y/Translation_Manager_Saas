import {createClient} from "@supabase/supabase-js";

import {getSupabasePublishableKey, getSupabaseUrl} from "@/lib/supabase/keys";

/** 無使用者 session 時呼叫僅限 anon 的 RPC（例如邀請預查）；RSC／Client 皆可。 */
export function createAnonPublicClient() {
  return createClient(getSupabaseUrl(), getSupabasePublishableKey());
}
