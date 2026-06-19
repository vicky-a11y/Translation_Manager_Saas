import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {buttonVariants} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {YearMonthFilter} from "@/components/ui/year-month-filter";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {cn} from "@/lib/utils";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";
import {logProjectQueryError} from "@/lib/supabase/log-project-query-error";

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

function isOverdue(deadlineIso: string | null) {
  if (!deadlineIso) return false;
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
}

function localeToBcp47(locale: AppLocale) {
  return locale === "zh-TW" || locale === "zh-CN"
    ? locale
    : locale === "ms"
      ? "ms-MY"
      : "en-US";
}

/** 一案多譯者：同一 assignee（業務編號）只顯示一次，以 translator_master.name 為主。 */
function buildTranslatorsDisplayByProjectId(
  assignRows: unknown[],
): Map<string, Map<string, string>> {
  const byProject = new Map<string, Map<string, string>>();

  for (const raw of assignRows) {
    const row = raw as {
      project_id: string;
      assignee_id: string;
      translator_master?: {name?: string | null} | Array<{name?: string | null}> | null;
    };
    const tm = Array.isArray(row.translator_master) ? row.translator_master[0] : row.translator_master;
    const label = ((tm?.name ?? "") as string).trim() || row.assignee_id;
    let forProject = byProject.get(row.project_id);
    if (!forProject) {
      forProject = new Map();
      byProject.set(row.project_id, forProject);
    }
    forProject.set(row.assignee_id, label);
  }

  return byProject;
}

function formatTranslatorCell(
  byProject: Map<string, Map<string, string>>,
  projectId: string,
  locale: AppLocale,
) {
  const forProject = byProject.get(projectId);
  if (!forProject?.size) return "—";

  const sorted = [...forProject.values()].sort((a, b) =>
    a.localeCompare(b, localeToBcp47(locale), {numeric: true}),
  );

  const tag = localeToBcp47(locale);
  try {
    return new Intl.ListFormat(tag, {type: "conjunction", style: "narrow"}).format(sorted);
  } catch {
    return sorted.join(locale === "en" ? ", " : "、");
  }
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{year?: string; month?: string}>;
}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const {year: yearParam, month: monthParam} = await searchParams;
  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;
  const validYear = Number.isFinite(year) ? year : now.getFullYear();
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
  const startISO = new Date(validYear, validMonth - 1, 1).toISOString();
  const endISO = new Date(validYear, validMonth, 1).toISOString();

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
  const {data: rows, error: projectsErr} = await supabase
    .from("projects")
    .select("id, project_code, title, delivery_deadline, customer_master(display_name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", {ascending: false})
    .limit(500);
  logProjectQueryError("projects list page", projectsErr, tenantId);
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "ProjectsPage"});
  const list = rows ?? [];

  const projectIds = list.map((r) => (r as {id: string}).id);
  let translatorsByProjectId = new Map<string, Map<string, string>>();
  if (projectIds.length > 0) {
    const {data: assignRows, error: assignErr} = await supabase
      .from("project_translator_assignments")
      .select(`
        project_id,
        assignee_id,
        translator_master!project_translator_assignments_assignee_fk (
          name
        )
      `)
      .eq("tenant_id", tenantId)
      .in("project_id", projectIds);
    logProjectQueryError("project_translator_assignments list", assignErr, tenantId);
    translatorsByProjectId = buildTranslatorsDisplayByProjectId(assignRows ?? []);
  }

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
          <Link href={`/${locale}/projects/new`} className={cn(buttonVariants({variant: "default"}), "shrink-0")}>
            {t("addProject")}
          </Link>
        </div>

        <YearMonthFilter year={validYear} month={validMonth} locale={locale} yearLabel={t("yearLabel")} />

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("emptyFiltered")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colProjectCode")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead>{t("colDeliveryDeadline")}</TableHead>
                <TableHead>{t("colExecutingTranslators")}</TableHead>
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
                const overdue = isOverdue(project.delivery_deadline);

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
                    <TableCell className={overdue ? "font-medium text-red-600" : "text-muted-foreground"}>
                      {formatDateTime(project.delivery_deadline, locale)}
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-muted-foreground break-words sm:max-w-xs">
                      {formatTranslatorCell(translatorsByProjectId, project.id, locale)}
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
