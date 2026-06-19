import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {buttonVariants} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {cn} from "@/lib/utils";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function valueOrDash(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

function formatTags(value: unknown) {
  if (!value) return "—";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "—";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ") || "—";
  } catch {
    // ignore
  }
  return "—";
}

export default async function TranslatorsPage({params}: {params: Promise<{locale: string}>}) {
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

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
    redirect(`/${locale}/welcome`);
  }

  const flags = parsePermissions(profile?.permissions);
  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  if (!isSuper && !flags.can_manage_vendors) {
    redirect(`/${locale}/dashboard`);
  }

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const {data: rows} = await supabase
    .from("translator_master")
    .select("id, translator_id, name, line_name, email, service_tags, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", {ascending: false})
    .limit(200);

  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "TranslatorsPage"});
  const list = rows ?? [];

  return (
    <DashboardShell
      locale={locale}
      tenantName={tenant?.name ?? "Workspace"}
      currentTenantId={tenantId}
      workspaceTenants={workspaceTenants}
      labels={{
        dashboard: navT("dashboard"),
        members: navT("members"),
        projects: navT("projects"),
        translators: navT("translators"),
        customers: navT("customers"),
        settings: navT("settings"),
        finance: navT("finance"),
        account: navT("account"),
        logout: navT("logout"),
        tenantWorkspace: navT("tenantWorkspace"),
        tenantSwitch: navT("tenantSwitch"),
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("heading")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/dashboard`} className={cn(buttonVariants({variant: "outline"}))}>
              {t("backToDashboard")}
            </Link>
            <Link href={`/${locale}/translators/new`} className={cn(buttonVariants({variant: "default"}))}>
              {t("addTranslator")}
            </Link>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[7rem]">{t("colTranslatorId")}</TableHead>
                  <TableHead className="min-w-[10rem]">{t("colName")}</TableHead>
                  <TableHead className="min-w-[12rem]">{t("colEmail")}</TableHead>
                  <TableHead>{t("colServiceTags")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => {
                  const r = row as {
                    id: string;
                    translator_id: string;
                    name: string;
                    line_name: string | null;
                    email: string;
                    service_tags: unknown;
                  };
                  const displayName = r.line_name?.trim() ? r.line_name.trim() : r.name;
                  const href = `/${locale}/translators/${r.id}`;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{valueOrDash(r.translator_id)}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={href} className="text-blue-600 underline underline-offset-2 hover:text-blue-700">
                          {valueOrDash(displayName)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{valueOrDash(r.email)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatTags(r.service_tags)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

