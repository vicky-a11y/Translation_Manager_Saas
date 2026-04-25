import type {PostgrestError, SupabaseClient} from "@supabase/supabase-js";

type PrimaryContactRow = {
  id: string;
  customer_id: string;
  im_platform: string | null;
  im_id: string | null;
};

/**
 * 將 customer_master 的主要 IM（im_platform + im_id）與「每客戶一筆」的主要聯絡人 (is_primary) 同步。
 * customer_contacts.im_id 租戶內在職防重（021）；寫入前請先於 action 做重複檢查。
 */
export async function getPrimaryContactForCustomer(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
): Promise<PrimaryContactRow | null> {
  const {data, error} = await supabase
    .from("customer_contacts")
    .select("id, customer_id, im_platform, im_id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as PrimaryContactRow;
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  return row;
}

/** 租戶內在職聯絡人是否已有相同 im_id（不分客戶）；排除指定聯絡人列 id。 */
export async function findActiveContactImDuplicateCustomerId(
  supabase: SupabaseClient,
  tenantId: string,
  normalizedImLower: string,
  excludeContactId?: string,
): Promise<string | null> {
  const {data, error} = await supabase
    .from("customer_contacts")
    .select("id, customer_id, im_id")
    .eq("tenant_id", tenantId)
    .eq("employment_status", 1)
    .not("im_id", "is", null);

  if (error || !data?.length) return null;

  for (const raw of data) {
    const row = raw as {id: string; customer_id: string; im_id: string};
    if (excludeContactId && row.id === excludeContactId) continue;
    if (String(row.im_id).trim().toLowerCase() === normalizedImLower) {
      return row.customer_id;
    }
  }
  return null;
}

export async function syncPrimaryContactFromMaster(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  params: {
    contactName: string;
    imPlatform: string | null;
    imId: string | null;
  },
): Promise<{error: PostgrestError | null}> {
  const contactName = params.contactName.trim().slice(0, 100) || "—";
  const imPlatform = params.imPlatform?.trim() || null;
  const imIdRaw = params.imId?.trim() || null;
  const imId = imIdRaw && imIdRaw.length > 0 ? imIdRaw.slice(0, 100) : null;

  const existing = await getPrimaryContactForCustomer(supabase, tenantId, customerId);

  if (!imPlatform && !imId) {
    if (!existing) {
      return {error: null};
    }
    const {error} = await supabase
      .from("customer_contacts")
      .update({
        im_platform: null,
        im_id: null,
        contact_name: contactName,
      })
      .eq("tenant_id", tenantId)
      .eq("id", existing.id);
    return {error};
  }

  if (!imPlatform || !imId) {
    throw new Error("syncPrimaryContactFromMaster: expected both im_platform and im_id or both cleared");
  }

  if (!existing) {
    const {error} = await supabase.from("customer_contacts").insert({
      tenant_id: tenantId,
      customer_id: customerId,
      contact_name: contactName,
      im_platform: imPlatform,
      im_id: imId,
      is_primary: true,
      employment_status: 1,
    });
    return {error};
  }

  const {error} = await supabase
    .from("customer_contacts")
    .update({
      contact_name: contactName,
      im_platform: imPlatform,
      im_id: imId,
    })
    .eq("tenant_id", tenantId)
    .eq("id", existing.id);

  return {error};
}
