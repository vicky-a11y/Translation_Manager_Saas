"use server";

import {headers} from "next/headers";

import {extractDomainFromEmail, isLikelyConsumerEmail} from "@/lib/email/work-email";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";

type ActionResult =
  | {ok: true; devVerifyUrl?: string}
  | {ok: false; code: "not_authenticated" | "missing_fields" | "consumer_email" | "insert_failed" | "unknown"};

/**
 * 以 DB 端 SECURITY DEFINER 依序建立：tenants → tenant_memberships (owner) → profiles（工作區與姓名）→ domain_verifications。
 * 避免在 Migration 006 的 RLS 下，客戶端在尚無 membership 時無法更新 profile。
 */
async function setupOrganization(
  supabase: SupabaseClient,
  params: {
    organizationName: string;
    fullName: string;
    workEmail: string;
    domain: string;
    primaryMembershipRole: "owner" | "manager";
  },
): Promise<{token: string} | {error: unknown}> {
  const {data, error} = await supabase.rpc("bootstrap_domain_onboarding_session", {
    p_organization_name: params.organizationName,
    p_full_name: params.fullName,
    p_work_email: params.workEmail,
    p_domain: params.domain,
    p_primary_membership_role: params.primaryMembershipRole,
  });

  if (error) {
    console.error("Onboarding DB Error:", error);
    return {error};
  }

  if (data == null || data === "") {
    console.error("Onboarding DB Error: bootstrap_domain_onboarding_session returned no token");
    return {error: new Error("no_token")};
  }

  return {token: String(data)};
}

async function resolvePublicBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  if (!host) return `http://localhost:3000`;
  return `${proto}://${host}`;
}

async function sendVerificationEmail(params: {to: string; verifyUrl: string; subject: string; html: string}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  return res.ok;
}

export async function submitDomainOnboarding(formData: FormData): Promise<ActionResult> {
  const locale = String(formData.get("locale") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const workEmail = String(formData.get("work_email") ?? "").trim().toLowerCase();
  const workspaceRoleRaw = String(formData.get("workspace_role") ?? "owner").trim().toLowerCase();
  const primaryMembershipRole: "owner" | "manager" = workspaceRoleRaw === "manager" ? "manager" : "owner";

  if (!fullName || !organizationName || !workEmail || !locale) {
    return {ok: false, code: "missing_fields"};
  }

  if (isLikelyConsumerEmail(workEmail)) {
    return {ok: false, code: "consumer_email"};
  }

  const domain = extractDomainFromEmail(workEmail);
  if (!domain) {
    return {ok: false, code: "missing_fields"};
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, code: "not_authenticated"};
  }

  const setup = await setupOrganization(supabase, {
    organizationName: organizationName,
    fullName: fullName,
    workEmail,
    domain,
    primaryMembershipRole,
  });

  if ("error" in setup) {
    return {ok: false, code: "insert_failed"};
  }

  const base = await resolvePublicBaseUrl();
  const verifyUrl = `${base}/${locale}/verify-domain?token=${setup.token}`;

  const sent = await sendVerificationEmail({
    to: workEmail,
    verifyUrl,
    subject: "Verify your company email",
    html: `<p>Please confirm your work email to finish onboarding.</p><p><a href="${verifyUrl}">Verify email</a></p>`,
  });

  if (!sent) {
    return {ok: true, devVerifyUrl: verifyUrl};
  }

  return {ok: true};
}

export async function submitManualReviewRequest(formData: FormData): Promise<ActionResult> {
  const locale = String(formData.get("locale") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!fullName || !locale) {
    return {ok: false, code: "missing_fields"};
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, code: "not_authenticated"};
  }

  const {error} = await supabase.from("manual_review_requests").insert({
    user_id: user.id,
    full_name: fullName,
    contact_email: user.email ?? null,
    notes: notes || null,
  });

  if (error) {
    console.error("Onboarding DB Error:", error);
    return {ok: false, code: "insert_failed"};
  }

  const {error: profileError} = await supabase.from("profiles").update({full_name: fullName}).eq("id", user.id);

  if (profileError) {
    console.error("Onboarding DB Error:", profileError);
    return {ok: false, code: "insert_failed"};
  }

  return {ok: true};
}
