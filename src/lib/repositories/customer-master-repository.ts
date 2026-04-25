import {createTenantScopedSupabase} from "@/lib/supabase/tenant-scoped-client";

import type {TenantContext} from "./tenant-context";

/** 與 public.customer_master 對齊之寫入欄位（不含 tenant_id / id / created_at）。 */
export type CustomerMasterInsertRow = {
  display_name: string;
  cid?: string | null;
  customer_type?: number | null;
  legal_name?: string | null;
  tax_id?: string | null;
  invoice_type?: number | null;
  country_code?: string | null;
  status?: number;
  contact_person?: string | null;
  email?: string | null;
  phone_mobile?: string | null;
  phone_office?: string | null;
  address?: string | null;
  remark?: string | null;
  is_active?: boolean;
  im_platform?: string | null;
  im_id?: string | null;
  internal_tags?: string | null;
};

export type CustomerMasterUpdateRow = CustomerMasterInsertRow;

export type CustomerMasterListRow = {
  id: string;
  cid: string | null;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * 客戶主檔；寫入時須帶入 tenant_id（不依賴 scoped `from().eq()` 與 insert 鏈式行為）。
 */
export function createCustomerMasterRepository(ctx: TenantContext) {
  const scoped = () => createTenantScopedSupabase(ctx.supabase, ctx.tenantId);

  return {
    scoped,

    /** 租戶內是否已有相同統一編號／稅號（不分大小寫、trim）。 */
    async findDuplicateTaxIdId(normalizedTaxLower: string, excludeCustomerId?: string): Promise<string | null> {
      const {data} = await scoped()
        .from("customer_master")
        .select("id, tax_id")
        .not("tax_id", "is", null);
      const hit = data?.find((r) => {
        const row = r as {id: string; tax_id: string};
        if (excludeCustomerId && row.id === excludeCustomerId) return false;
        return String(row.tax_id).trim().toLowerCase() === normalizedTaxLower;
      });
      return hit ? String((hit as {id: string}).id) : null;
    },

    /** 租戶內是否已有相同主要通訊平台 + 帳號（trim + lower 比對 im_id）。 */
    async findDuplicateImIdId(platform: string, normalizedImLower: string, excludeCustomerId?: string): Promise<string | null> {
      const {data} = await scoped()
        .from("customer_master")
        .select("id, im_id, im_platform")
        .eq("im_platform", platform)
        .not("im_id", "is", null);
      const hit = data?.find((r) => {
        const row = r as {id: string; im_id: string};
        if (excludeCustomerId && row.id === excludeCustomerId) return false;
        return String(row.im_id).trim().toLowerCase() === normalizedImLower;
      });
      return hit ? String((hit as {id: string}).id) : null;
    },

    insert(row: CustomerMasterInsertRow) {
      const payload: Record<string, unknown> = {
        tenant_id: ctx.tenantId,
        display_name: row.display_name,
        cid: row.cid && row.cid.trim() !== "" ? row.cid.trim() : null,
        customer_type: row.customer_type ?? null,
        legal_name: row.legal_name ?? null,
        tax_id: row.tax_id && row.tax_id.trim() !== "" ? row.tax_id.trim() : null,
        invoice_type: row.invoice_type ?? null,
        country_code: row.country_code ? row.country_code.trim().toUpperCase() : null,
        status: row.status ?? 1,
        contact_person: row.contact_person && row.contact_person.trim() !== "" ? row.contact_person.trim() : null,
        email: row.email && row.email.trim() !== "" ? row.email.trim() : null,
        phone_mobile: row.phone_mobile && row.phone_mobile.trim() !== "" ? row.phone_mobile.trim() : null,
        phone_office: row.phone_office && row.phone_office.trim() !== "" ? row.phone_office.trim() : null,
        address: row.address && row.address.trim() !== "" ? row.address.trim() : null,
        remark: row.remark && row.remark.trim() !== "" ? row.remark.trim() : null,
        is_active: row.is_active ?? true,
        im_platform: row.im_platform && row.im_platform.trim() !== "" ? row.im_platform.trim() : null,
        im_id: row.im_id && row.im_id.trim() !== "" ? row.im_id.trim() : null,
        internal_tags: row.internal_tags && row.internal_tags.trim() !== "" ? row.internal_tags.trim() : null,
      };
      return ctx.supabase.from("customer_master").insert(payload).select("id").single();
    },

    updateById(customerId: string, row: CustomerMasterUpdateRow) {
      const payload = {
        display_name: row.display_name,
        cid: row.cid && row.cid.trim() !== "" ? row.cid.trim() : null,
        customer_type: row.customer_type ?? null,
        legal_name: row.legal_name && row.legal_name.trim() !== "" ? row.legal_name.trim() : null,
        tax_id: row.tax_id && row.tax_id.trim() !== "" ? row.tax_id.trim() : null,
        invoice_type: row.invoice_type ?? null,
        country_code: row.country_code ? row.country_code.trim().toUpperCase() : null,
        status: row.status ?? 1,
        contact_person: row.contact_person && row.contact_person.trim() !== "" ? row.contact_person.trim() : null,
        email: row.email && row.email.trim() !== "" ? row.email.trim() : null,
        phone_mobile: row.phone_mobile && row.phone_mobile.trim() !== "" ? row.phone_mobile.trim() : null,
        phone_office: row.phone_office && row.phone_office.trim() !== "" ? row.phone_office.trim() : null,
        address: row.address && row.address.trim() !== "" ? row.address.trim() : null,
        remark: row.remark && row.remark.trim() !== "" ? row.remark.trim() : null,
        is_active: row.is_active ?? true,
        im_platform: row.im_platform && row.im_platform.trim() !== "" ? row.im_platform.trim() : null,
        im_id: row.im_id && row.im_id.trim() !== "" ? row.im_id.trim() : null,
        internal_tags: row.internal_tags && row.internal_tags.trim() !== "" ? row.internal_tags.trim() : null,
      };
      return ctx.supabase
        .from("customer_master")
        .update(payload)
        .eq("tenant_id", ctx.tenantId)
        .eq("id", customerId)
        .select("id, updated_at")
        .single();
    },

    getById(customerId: string) {
      return scoped().from("customer_master").select("*").eq("id", customerId).maybeSingle();
    },

    listRecent(limit: number) {
      return scoped()
        .from("customer_master")
        .select("id, cid, display_name, is_active, created_at, updated_at")
        .order("updated_at", {ascending: false})
        .limit(limit);
    },
  };
}
