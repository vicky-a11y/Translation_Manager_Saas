"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

const ADMIN_ROLES = new Set(["owner", "admin"]);
const INVITE_ROLES = new Set(["manager", "admin", "staff", "vendor"]);

export async function createMemberInvitation(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff").trim();

  if (!locale || !email || !INVITE_ROLES.has(role)) {
    return;
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

  const {error} = await supabase.from("invitations").insert({
    email,
    tenant_id: workspaceTenantId,
    invited_role: role,
    status: "pending",
  });

  if (error) {
    return;
  }

  revalidatePath(`/${locale}/members`, "page");
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
