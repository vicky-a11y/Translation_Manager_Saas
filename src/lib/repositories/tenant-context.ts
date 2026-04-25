import type {SupabaseClient} from "@supabase/supabase-js";

/**
 * 傳入 Repository／Service 的租戶脈絡；未來可替換為依租戶的連線工廠產物。
 */
export type TenantContext = {
  tenantId: string;
  supabase: SupabaseClient;
};
