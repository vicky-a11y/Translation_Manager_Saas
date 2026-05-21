"use server";

import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

export type CustomerSearchOption = {
  id: string;
  cid: string | null;
  displayName: string;
};

/** Strip ILIKE wildcards so user input cannot broaden the pattern. */
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_]/g, "").slice(0, 80);
}

function dedupeById(rows: {id: string; cid: string | null; display_name: string | null}[]) {
  const seen = new Set<string>();
  const out: CustomerSearchOption[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      cid: row.cid != null ? String(row.cid) : null,
      displayName: row.display_name != null ? String(row.display_name) : "",
    });
  }
  return out;
}

/**
 * 依客戶名稱或業務編號（cid）模糊搜尋啟用中的客戶；供新增案件表單使用。
 */
export async function searchActiveCustomersAction(query: string): Promise<CustomerSearchOption[]> {
  const term = sanitizeSearchTerm(query);
  if (term.length < 1) return [];

  const pattern = `%${term}%`;
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return [];

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) return [];

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  if (!isSuper && !flags.can_edit_projects) return [];

  const base = () =>
    supabase
      .from("customer_master")
      .select("id, cid, display_name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

  const [byName, byCid] = await Promise.all([
    base().ilike("display_name", pattern).limit(25),
    base().not("cid", "is", null).ilike("cid", pattern).limit(25),
  ]);

  const merged = dedupeById([...(byName.data ?? []), ...(byCid.data ?? [])]);
  return merged.slice(0, 30);
}
