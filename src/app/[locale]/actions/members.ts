"use server";

import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";

const ADMIN_ROLES = new Set(["owner", "admin"]);
const INVITE_ROLES = new Set(["manager", "admin", "staff", "vendor"]);

type InviteStatus =
  | "sent"
  | "resent"
  | "email_not_configured"
  | "email_failed"
  | "create_failed"
  | "forbidden"
  | "validation"
  | "no_workspace";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function redirectWithInviteStatus(locale: AppLocale, status: InviteStatus): never {
  redirect(`/${locale}/members?invite=${status}`);
}

async function resolvePublicBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendInvitationEmail(params: {
  to: string;
  inviteUrl: string;
  tenantName: string;
}): Promise<"sent" | "not_configured" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.error("Resend invitation email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL");
    return "not_configured";
  }

  const tenantName = escapeHtml(params.tenantName);
  const inviteUrl = escapeHtml(params.inviteUrl);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `Invitation to join ${params.tenantName}`,
      html: `
        <p>You have been invited to join <strong>${tenantName}</strong>.</p>
        <p>Open the link below to accept the invitation:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>If you did not expect this invitation, you can ignore this email.</p>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend invitation email failed:", {
      status: res.status,
      statusText: res.statusText,
      body,
      from,
      to: params.to,
    });
    return "failed";
  }

  return "sent";
}

export async function createMemberInvitation(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff").trim();

  if (!email || !INVITE_ROLES.has(role)) {
    redirectWithInviteStatus(locale, "validation");
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceTenantId = getWorkspaceTenantId(profile);
  if (!workspaceTenantId) {
    redirectWithInviteStatus(locale, "no_workspace");
  }

  const {data: membership} = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceTenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !ADMIN_ROLES.has(membership.role)) {
    redirectWithInviteStatus(locale, "forbidden");
  }

  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", workspaceTenantId).maybeSingle();

  const {data: invitation, error} = await supabase
    .from("invitations")
    .insert({
      email,
      tenant_id: workspaceTenantId,
      invited_role: role,
      status: "pending",
    })
    .select("token")
    .single();

  if (error) {
    console.error("Create member invitation failed:", error);
    redirectWithInviteStatus(locale, "create_failed");
  }

  const token = String(invitation?.token ?? "");
  if (!token) {
    console.error("Create member invitation failed: insert returned no token");
    redirectWithInviteStatus(locale, "create_failed");
  }

  const base = await resolvePublicBaseUrl();
  const inviteUrl = `${base}/${locale}/invite/${token}`;
  const emailStatus = await sendInvitationEmail({
    to: email,
    inviteUrl,
    tenantName: tenant?.name ?? "your workspace",
  });

  revalidatePath(`/${locale}/members`, "page");
  if (emailStatus === "not_configured") {
    redirectWithInviteStatus(locale, "email_not_configured");
  }
  if (emailStatus === "failed") {
    redirectWithInviteStatus(locale, "email_failed");
  }
  redirectWithInviteStatus(locale, "sent");
}

export async function resendMemberInvitation(formData: FormData): Promise<void> {
  const localeRaw = String(formData.get("locale") ?? "").trim();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const invitationId = String(formData.get("invitation_id") ?? "").trim();

  if (!invitationId) {
    redirectWithInviteStatus(locale, "validation");
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceTenantId = getWorkspaceTenantId(profile);
  if (!workspaceTenantId) {
    redirectWithInviteStatus(locale, "no_workspace");
  }

  const {data: membership} = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceTenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !ADMIN_ROLES.has(membership.role)) {
    redirectWithInviteStatus(locale, "forbidden");
  }

  const {data: invitation, error} = await supabase
    .from("invitations")
    .select("email, token, status")
    .eq("id", invitationId)
    .eq("tenant_id", workspaceTenantId)
    .maybeSingle();

  if (error || !invitation || invitation.status !== "pending") {
    if (error) console.error("Load member invitation for resend failed:", error);
    redirectWithInviteStatus(locale, "validation");
  }

  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", workspaceTenantId).maybeSingle();
  const base = await resolvePublicBaseUrl();
  const inviteUrl = `${base}/${locale}/invite/${invitation.token}`;
  const emailStatus = await sendInvitationEmail({
    to: invitation.email,
    inviteUrl,
    tenantName: tenant?.name ?? "your workspace",
  });

  revalidatePath(`/${locale}/members`, "page");
  if (emailStatus === "not_configured") {
    redirectWithInviteStatus(locale, "email_not_configured");
  }
  if (emailStatus === "failed") {
    redirectWithInviteStatus(locale, "email_failed");
  }
  redirectWithInviteStatus(locale, "resent");
}

export async function removeMemberFromTenant(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "").trim();
  const targetId = String(formData.get("user_id") ?? "").trim();

  if (!locale || !targetId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (targetId === user.id) {
    return;
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceTenantId = getWorkspaceTenantId(profile);
  if (!workspaceTenantId) {
    return;
  }

  const {data: membership} = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceTenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !ADMIN_ROLES.has(membership.role)) {
    return;
  }

  const {error} = await supabase
    .from("tenant_memberships")
    .update({is_active: false})
    .eq("user_id", targetId)
    .eq("tenant_id", workspaceTenantId);

  if (error) {
    return;
  }

  revalidatePath(`/${locale}/members`, "page");
}
