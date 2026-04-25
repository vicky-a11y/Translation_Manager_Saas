import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {buttonVariants} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {createCustomerMasterRepository} from "@/lib/repositories/customer-master-repository";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {cn} from "@/lib/utils";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function formatTs(iso: string, locale: AppLocale) {
  try {
    const tag =
      locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function CustomersIndexPage({params}: {params: Promise<{locale: string}>}) {
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
  if (!isSuper && !flags.can_edit_projects) {
    redirect(`/${locale}/dashboard`);
  }

  const repo = createCustomerMasterRepository({supabase, tenantId});
  const {data: rows} = await repo.listRecent(200);

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "CustomersIndex"});

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
        customers: navT("customers"),
        settings: navT("settings"),
        finance: navT("finance"),
        account: navT("account"),
        logout: navT("logout"),
        tenantWorkspace: navT("tenantWorkspace"),
        tenantSwitch: navT("tenantSwitch"),
      }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("heading")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <Link href={`/${locale}/customers/new`} className={cn(buttonVariants({variant: "default"}), "shrink-0")}>
            {t("addCustomer")}
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDisplayName")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("colCid")}</TableHead>
                <TableHead className="w-20">{t("colActive")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("colUpdated")}</TableHead>
                <TableHead className="w-24 text-end">
                  <span className="sr-only">{t("openEdit")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => {
                const r = row as {
                  id: string;
                  cid: string | null;
                  display_name: string;
                  is_active?: boolean;
                  updated_at: string;
                };
                const active = r.is_active !== false;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.display_name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {r.cid && r.cid.trim() !== "" ? r.cid : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{active ? t("activeYes") : t("activeNo")}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatTs(r.updated_at, locale)}
                    </TableCell>
                    <TableCell className="text-end">
                      <Link
                        href={`/${locale}/customers/${r.id}`}
                        className={cn(buttonVariants({variant: "outline", size: "sm"}))}
                      >
                        {t("openEdit")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardShell>
  );
}
