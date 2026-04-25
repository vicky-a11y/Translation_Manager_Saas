import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {createMemberInvitation} from "@/app/[locale]/actions/members";
import {MembersDataTable, type MemberTableRow} from "@/components/members/members-data-table";
import {DashboardShell} from "@/components/layout/dashboard-shell";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

const ADMIN_ROLES = new Set(["owner", "admin"]);

export default async function MembersPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceTenantId = getWorkspaceTenantId(profile);

  if (!workspaceTenantId) {
    redirect(`/${locale}/welcome`);
  }

  const {data: myMembership} = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", workspaceTenantId)
    .eq("is_active", true)
    .maybeSingle();

  const myFlags = parsePermissions(profile?.permissions);
  const profileRole = (profile?.role as ProfileRole | undefined) ?? "staff";
  const canAccessMembersPage =
    profileRole === "super_admin" ||
    (myMembership && ADMIN_ROLES.has(myMembership.role)) ||
    myFlags.can_manage_vendors;

  if (!canAccessMembersPage || !myMembership) {
    redirect(`/${locale}/dashboard`);
  }

  const canEditMemberPermissions =
    myMembership.role === "owner" || profileRole === "tenant_owner" || profileRole === "super_admin";

  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", workspaceTenantId).maybeSingle();

  const {data: membershipRows} = await supabase
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", workspaceTenantId)
    .eq("is_active", true);

  const memberIds = (membershipRows ?? []).map((m) => m.user_id);
  const roleByUserId = new Map((membershipRows ?? []).map((m) => [m.user_id, m.role]));

  const {data: profileRows} =
    memberIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, nickname, role, permissions")
          .in("id", memberIds)
          .order("full_name", {ascending: true})
      : {data: [] as {id: string; full_name: string | null; nickname: string | null; role: string; permissions: unknown}[]};

  const members: MemberTableRow[] = (profileRows ?? []).map((p) => ({
    id: p.id,
    full_name: p.nickname?.trim() ? p.nickname.trim() : p.full_name,
    membershipRole: roleByUserId.get(p.id) ?? "staff",
    profileRole: p.role ?? "staff",
    permissions: parsePermissions(p.permissions),
  }));

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);

  const {data: invites} = await supabase
    .from("invitations")
    .select("id, email, status, invited_role, created_at, expires_at")
    .eq("tenant_id", workspaceTenantId)
    .order("created_at", {ascending: false});

  const navT = await getTranslations({locale, namespace: "Navigation"});
  const membersT = await getTranslations({locale, namespace: "Members"});

  return (
    <DashboardShell
      locale={locale}
      tenantName={tenant?.name ?? "Workspace"}
      currentTenantId={workspaceTenantId}
      workspaceTenants={workspaceTenants}
      labels={{
        dashboard: navT("dashboard"),
        members: navT("members"),
        projects: navT("projects"),
        customers: navT("customers"),
        settings: navT("settings"),
        finance: navT("finance"),
        account: navT("account"),
        logout: navT("logout"),
        tenantWorkspace: navT("tenantWorkspace"),
        tenantSwitch: navT("tenantSwitch"),
      }}
    >
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{membersT("title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{membersT("subtitle")}</p>
        </div>

        {ADMIN_ROLES.has(myMembership.role) ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">{membersT("inviteHeading")}</h3>
            <form action={createMemberInvitation} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="locale" value={locale} />
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-zinc-600" htmlFor="invite-email">
                  {membersT("email")}
                </label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
                />
              </div>
              <div className="w-full space-y-1 sm:w-40">
                <label className="text-xs font-medium text-zinc-600" htmlFor="invite-role">
                  {membersT("role")}
                </label>
                <select
                  id="invite-role"
                  name="role"
                  defaultValue="staff"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
                >
                  <option value="staff">{membersT("roleStaff")}</option>
                  <option value="vendor">{membersT("roleVendor")}</option>
                  <option value="admin">{membersT("roleAdmin")}</option>
                  <option value="manager">{membersT("roleManager")}</option>
                </select>
              </div>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {membersT("inviteCta")}
              </button>
            </form>
            <p className="mt-3 text-xs text-zinc-500">{membersT("inviteUrlHint", {locale})}</p>
          </section>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">{membersT("memberListHeading")}</h3>
          <div className="mt-4">
            <MembersDataTable
              locale={locale}
              rows={members}
              currentUserId={user.id}
              canEditMemberPermissions={canEditMemberPermissions}
              canRemoveMembers={ADMIN_ROLES.has(myMembership.role)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">{membersT("invitesHeading")}</h3>
          <ul className="mt-4 divide-y divide-zinc-100">
            {(invites ?? []).length === 0 ? (
              <li className="py-3 text-sm text-zinc-500">{membersT("noInvites")}</li>
            ) : (
              (invites ?? []).map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="font-medium text-zinc-900">{inv.email}</span>
                  <span className="text-xs text-zinc-500">
                    {inv.status} · {inv.invited_role}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </DashboardShell>
  );
}
