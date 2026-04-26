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

function formatDateTime(value: string | null, locale: AppLocale) {
  if (!value) return "—";

  try {
    const tag =
      locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function ProjectsPage({params}: {params: Promise<{locale: string}>}) {
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

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const {data: rows} = await supabase
    .from("projects")
    .select("id, project_code, title, delivery_deadline, customer_master(display_name)")
    .eq("tenant_id", tenantId)
    .order("created_at", {ascending: false})
    .limit(100);
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "ProjectsPage"});
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("heading")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <Link href={`/${locale}/projects/new`} className={cn(buttonVariants({variant: "default"}), "shrink-0")}>
            {t("addProject")}
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
                <TableHead>{t("colProjectCode")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead>{t("colDeliveryDeadline")}</TableHead>
                <TableHead>{t("colCustomerName")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => {
                const project = row as {
                  id: string;
                  project_code: string | null;
                  title: string;
                  delivery_deadline: string | null;
                  customer_master?: {display_name?: string | null} | Array<{display_name?: string | null}> | null;
                };
                const customer = Array.isArray(project.customer_master)
                  ? project.customer_master[0]
                  : project.customer_master;
                const detailHref = `/${locale}/projects/${project.id}`;

                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={detailHref}
                        className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
                      >
                        {project.project_code ?? project.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={detailHref} className="text-blue-600 underline underline-offset-2 hover:text-blue-700">
                        {project.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(project.delivery_deadline, locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customer?.display_name ?? "—"}</TableCell>
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
