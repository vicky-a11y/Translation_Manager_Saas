import {createBrowserClient} from "@supabase/ssr";

import {getSupabasePublishableKey, getSupabaseUrl} from "@/lib/supabase/keys";

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}
