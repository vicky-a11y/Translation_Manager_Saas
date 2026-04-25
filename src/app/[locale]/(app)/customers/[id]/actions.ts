"use server";

import {
  CUSTOMER_COUNTRY_CODES,
  IM_PLATFORMS,
  isEnterpriseCustomerType,
  isValidTwEnterpriseTaxId,
} from "@/lib/customers/customer-creation-rules";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {createCustomerMasterRepository} from "@/lib/repositories/customer-master-repository";
import {
  findActiveContactImDuplicateCustomerId,
  getPrimaryContactForCustomer,
  syncPrimaryContactFromMaster,
} from "@/lib/repositories/customer-primary-contact-sync";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

export type UpdateCustomerFormState = {
  saved?: boolean;
  errorKey?:
    | "auth"
    | "no_workspace"
    | "forbidden"
    | "validation"
    | "duplicate"
    | "duplicate_tax"
    | "duplicate_im"
    | "database"
    | "not_found";
  duplicateExistingId?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isImPlatform(v: string): v is (typeof IM_PLATFORMS)[number] {
  return (IM_PLATFORMS as readonly string[]).includes(v);
}

export async function updateCustomerAction(
  _prev: UpdateCustomerFormState,
  formData: FormData,
): Promise<UpdateCustomerFormState> {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {errorKey: "auth"};
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
    return {errorKey: "no_workspace"};
  }

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  if (!isSuper && !flags.can_edit_projects) {
    return {errorKey: "forbidden"};
  }

  const customerId = String(formData.get("customer_id") ?? "").trim();
  if (!customerId || !uuidPattern.test(customerId)) {
    return {errorKey: "validation"};
  }

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name || display_name.length > 100) {
    return {errorKey: "validation"};
  }

  const cid = String(formData.get("cid") ?? "").trim();
  if (cid.length > 20) {
    return {errorKey: "validation"};
  }

  const legal_name = String(formData.get("legal_name") ?? "").trim();
  if (!legal_name || legal_name.length > 200) {
    return {errorKey: "validation"};
  }

  const tax_id = String(formData.get("tax_id") ?? "").trim();
  const contact_person = String(formData.get("contact_person") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone_mobile = String(formData.get("phone_mobile") ?? "").trim();
  const phone_office = String(formData.get("phone_office") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim();
  const internal_tags = String(formData.get("internal_tags") ?? "").trim();
  const im_platform_raw = String(formData.get("im_platform") ?? "").trim();
  const im_id = String(formData.get("im_id") ?? "").trim();
  const is_active = String(formData.get("is_active") ?? "0") === "1";

  const customer_type_raw = String(formData.get("customer_type") ?? "").trim();
  const country_code_raw = String(formData.get("country_code") ?? "").trim();
  const invoice_type_raw = String(formData.get("invoice_type") ?? "").trim();

  if (tax_id.length > 50) {
    return {errorKey: "validation"};
  }
  if (contact_person.length > 100 || phone_mobile.length > 50 || phone_office.length > 50) {
    return {errorKey: "validation"};
  }
  if (email && (email.length > 255 || !emailPattern.test(email))) {
    return {errorKey: "validation"};
  }
  if (remark.length > 2000 || internal_tags.length > 2000) {
    return {errorKey: "validation"};
  }

  const customer_type = Number(customer_type_raw);
  if (!Number.isInteger(customer_type) || customer_type < 1 || customer_type > 4) {
    return {errorKey: "validation"};
  }

  const country_code = country_code_raw.trim().toUpperCase();
  if (
    country_code.length !== 2 ||
    !/^[A-Z]{2}$/.test(country_code) ||
    !(CUSTOMER_COUNTRY_CODES as readonly string[]).includes(country_code)
  ) {
    return {errorKey: "validation"};
  }

  if (isEnterpriseCustomerType(customer_type)) {
    if (!tax_id) {
      return {errorKey: "validation"};
    }
    if (country_code === "TW" && !isValidTwEnterpriseTaxId(tax_id)) {
      return {errorKey: "validation"};
    }
  }

  if (!isImPlatform(im_platform_raw)) {
    return {errorKey: "validation"};
  }
  if (!im_id || im_id.length > 100) {
    return {errorKey: "validation"};
  }

  const invoice_type = Number(invoice_type_raw);
  if (!Number.isInteger(invoice_type) || invoice_type < 1 || invoice_type > 5) {
    return {errorKey: "validation"};
  }

  const im_platform = im_platform_raw;

  const repo = createCustomerMasterRepository({supabase, tenantId});
  const {data: existing} = await repo.getById(customerId);
  if (!existing) {
    return {errorKey: "not_found"};
  }

  const ex = existing as Record<string, unknown>;
  const prevImPlatform = ex.im_platform != null ? String(ex.im_platform) : null;
  const prevImId = ex.im_id != null ? String(ex.im_id) : null;

  if (tax_id) {
    const dupTax = await repo.findDuplicateTaxIdId(tax_id.toLowerCase(), customerId);
    if (dupTax) {
      return {errorKey: "duplicate_tax", duplicateExistingId: dupTax};
    }
  }

  const dupIm = await repo.findDuplicateImIdId(im_platform, im_id.toLowerCase(), customerId);
  if (dupIm) {
    return {errorKey: "duplicate_im", duplicateExistingId: dupIm};
  }

  const primary = await getPrimaryContactForCustomer(supabase, tenantId, customerId);
  const dupImContact = await findActiveContactImDuplicateCustomerId(
    supabase,
    tenantId,
    im_id.toLowerCase(),
    primary?.id,
  );
  if (dupImContact && dupImContact !== customerId) {
    return {errorKey: "duplicate_im", duplicateExistingId: dupImContact};
  }

  const payload = {
    display_name,
    cid: cid || null,
    customer_type,
    legal_name,
    tax_id: tax_id || null,
    invoice_type,
    country_code,
    status: is_active ? 1 : 0,
    contact_person: contact_person || null,
    email: email || null,
    phone_mobile: phone_mobile || null,
    phone_office: phone_office || null,
    address: address || null,
    remark: remark || null,
    is_active,
    im_platform,
    im_id,
    internal_tags: internal_tags || null,
  };

  const {error} = await repo.updateById(customerId, payload);

  if (error) {
    if (error.code === "23505") {
      return {errorKey: "duplicate"};
    }
    return {errorKey: "database"};
  }

  const {error: syncError} = await syncPrimaryContactFromMaster(supabase, tenantId, customerId, {
    contactName: display_name,
    imPlatform: im_platform,
    imId: im_id,
  });

  if (syncError) {
    await repo.updateById(customerId, {
      ...payload,
      im_platform: prevImPlatform,
      im_id: prevImId,
    });
    if (syncError.code === "23505") {
      const owner = await findActiveContactImDuplicateCustomerId(supabase, tenantId, im_id.toLowerCase(), primary?.id);
      return {errorKey: "duplicate_im", duplicateExistingId: owner ?? undefined};
    }
    return {errorKey: "database"};
  }

  return {saved: true};
}
