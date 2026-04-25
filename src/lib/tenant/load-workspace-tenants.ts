import type {SupabaseClient} from "@supabase/supabase-js";

import type {TenantSwitcherOption} from "@/components/layout/tenant-switcher";

export async function loadWorkspaceTenantOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<TenantSwitcherOption[]> {
  const {data, error} = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", {ascending: true});

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const tenants = row.tenants as unknown;
    let name = "Workspace";
    if (Array.isArray(tenants)) {
      const first = tenants[0] as {name?: string | null} | undefined;
      name = first?.name?.trim() || name;
    } else if (tenants && typeof tenants === "object" && "name" in tenants) {
      name = String((tenants as {name?: string | null}).name ?? "").trim() || name;
    }
    return {id: row.tenant_id as string, name};
  });
}
