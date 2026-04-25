"use server";

import {redirect} from "next/navigation";

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
  syncPrimaryContactFromMaster,
} from "@/lib/repositories/customer-primary-contact-sync";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

export type CreateCustomerFormState = {
  errorKey?:
    | "auth"
    | "no_workspace"
    | "forbidden"
    | "validation"
    | "duplicate"
    | "duplicate_tax"
    | "duplicate_im"
    | "database";
  duplicateExistingId?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isImPlatform(v: string): v is (typeof IM_PLATFORMS)[number] {
  return (IM_PLATFORMS as readonly string[]).includes(v);
}

export async function createCustomerAction(
  _prev: CreateCustomerFormState,
  formData: FormData,
): Promise<CreateCustomerFormState> {
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

  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = localeRaw || "zh-TW";

  const customer_type_raw = String(formData.get("customer_type") ?? "").trim();
  const customer_type = Number(customer_type_raw);
  if (!Number.isInteger(customer_type) || customer_type < 1 || customer_type > 4) {
    return {errorKey: "validation"};
  }

  const legal_name = String(formData.get("legal_name") ?? "").trim();
  if (!legal_name || legal_name.length > 200) {
    return {errorKey: "validation"};
  }

  const display_name_in = String(formData.get("display_name") ?? "").trim();
  const display_name =
    display_name_in.length > 0 ? display_name_in.slice(0, 100) : legal_name.slice(0, 100);

  const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  if (
    country_code.length !== 2 ||
    !/^[A-Z]{2}$/.test(country_code) ||
    !(CUSTOMER_COUNTRY_CODES as readonly string[]).includes(country_code)
  ) {
    return {errorKey: "validation"};
  }

  const tax_id = String(formData.get("tax_id") ?? "").trim();
  if (tax_id.length > 50) {
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

  const im_platform_raw = String(formData.get("im_platform") ?? "").trim();
  if (!isImPlatform(im_platform_raw)) {
    return {errorKey: "validation"};
  }
  const im_id = String(formData.get("im_id") ?? "").trim();
  if (!im_id || im_id.length > 100) {
    return {errorKey: "validation"};
  }

  const email = String(formData.get("email") ?? "").trim();
  if (email && (email.length > 255 || !emailPattern.test(email))) {
    return {errorKey: "validation"};
  }

  const invoice_type_raw = String(formData.get("invoice_type") ?? "").trim();
  const invoice_type = Number(invoice_type_raw);
  if (!Number.isInteger(invoice_type) || invoice_type < 1 || invoice_type > 5) {
    return {errorKey: "validation"};
  }

  const internal_tags = String(formData.get("internal_tags") ?? "").trim();
  if (internal_tags.length > 2000) {
    return {errorKey: "validation"};
  }

  const remark = String(formData.get("remark") ?? "").trim();
  if (remark.length > 2000) {
    return {errorKey: "validation"};
  }

  const cid = String(formData.get("cid") ?? "").trim();
  if (cid.length > 20) {
    return {errorKey: "validation"};
  }

  const contact_person = String(formData.get("contact_person") ?? "").trim();
  const phone_mobile = String(formData.get("phone_mobile") ?? "").trim();
  const phone_office = String(formData.get("phone_office") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (contact_person.length > 100 || phone_mobile.length > 50 || phone_office.length > 50) {
    return {errorKey: "validation"};
  }

  const is_active = String(formData.get("is_active") ?? "1") !== "0";

  const repo = createCustomerMasterRepository({supabase, tenantId});

  if (tax_id) {
    const dupTax = await repo.findDuplicateTaxIdId(tax_id.toLowerCase());
    if (dupTax) {
      return {errorKey: "duplicate_tax", duplicateExistingId: dupTax};
    }
  }

  const dupIm = await repo.findDuplicateImIdId(im_platform_raw, im_id.toLowerCase());
  if (dupIm) {
    return {errorKey: "duplicate_im", duplicateExistingId: dupIm};
  }

  const dupImContact = await findActiveContactImDuplicateCustomerId(supabase, tenantId, im_id.toLowerCase());
  if (dupImContact) {
    return {errorKey: "duplicate_im", duplicateExistingId: dupImContact};
  }

  const {data, error} = await repo.insert({
    display_name,
    cid: cid || null,
    customer_type,
    legal_name,
    tax_id: tax_id || null,
    country_code,
    invoice_type,
    im_platform: im_platform_raw,
    im_id,
    internal_tags: internal_tags || null,
    contact_person: contact_person || null,
    email: email || null,
    phone_mobile: phone_mobile || null,
    phone_office: phone_office || null,
    address: address || null,
    remark: remark || null,
    is_active,
    status: 1,
  });

  if (error) {
    if (error.code === "23505") {
      return {errorKey: "duplicate"};
    }
    return {errorKey: "database"};
  }

  const id = data?.id as string | undefined;
  if (!id) {
    return {errorKey: "database"};
  }

  const {error: syncError} = await syncPrimaryContactFromMaster(supabase, tenantId, id, {
    contactName: display_name,
    imPlatform: im_platform_raw,
    imId: im_id,
  });
  if (syncError) {
    await supabase.from("customer_master").delete().eq("tenant_id", tenantId).eq("id", id);
    if (syncError.code === "23505") {
      const owner = await findActiveContactImDuplicateCustomerId(supabase, tenantId, im_id.toLowerCase());
      return {errorKey: "duplicate_im", duplicateExistingId: owner ?? undefined};
    }
    return {errorKey: "database"};
  }

  redirect(`/${locale}/customers/${id}`);
}
