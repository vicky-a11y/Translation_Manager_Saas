"use server";

import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";

export type IntakePayload = {
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  has_tax_invoice: boolean;
  tax_title: string;
  tax_id: string;
  need_shipping: boolean;
  shipping_name: string;
  shipping_phone: string;
  shipping_zipcode: string;
  shipping_address: string;
  intake_channel: string;
  project_type_note: string;
  remittance_amount: string;
  remittance_bank_name: string;
  remittance_account_last5: string;
};

export type IntakeSubmitResult =
  | {ok: true}
  | {
      ok: false;
      errorKey:
        | "missing_name"
        | "invalid_email"
        | "invalid_last5"
        | "invalid_or_expired_link"
        | "submit_failed";
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(message: string): IntakeSubmitResult {
  const m = message.toLowerCase();
  if (m.includes("missing_name")) return {ok: false, errorKey: "missing_name"};
  if (m.includes("invalid_email")) return {ok: false, errorKey: "invalid_email"};
  if (m.includes("invalid_last5")) return {ok: false, errorKey: "invalid_last5"};
  if (m.includes("invalid_or_expired_link")) return {ok: false, errorKey: "invalid_or_expired_link"};
  return {ok: false, errorKey: "submit_failed"};
}

export async function submitCustomerIntakeAction(
  token: string,
  payload: IntakePayload,
): Promise<IntakeSubmitResult> {
  const normalized = token.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) {
    return {ok: false, errorKey: "invalid_or_expired_link"};
  }

  const supabase = createAnonPublicClient();
  const {data, error} = await supabase.rpc("submit_customer_intake", {
    p_token: normalized,
    payload,
  });

  if (error) {
    return mapError(error.message ?? "");
  }

  const ok =
    (typeof data === "object" && data !== null && (data as {ok?: boolean}).ok === true) ||
    data === true;
  return ok ? {ok: true} : {ok: false, errorKey: "submit_failed"};
}
