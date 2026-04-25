import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardOverviewSection} from "@/components/dashboard/dashboard-overview-section";
import {DashboardShell} from "@/components/layout/dashboard-shell";
import {createClient} from "@/lib/supabase/server";
import {createProjectsRepository} from "@/lib/repositories/projects-repository";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {logProjectQueryError} from "@/lib/supabase/log-project-query-error";
import {
  dashboardInProgressExcludedForQuery,
  PROJECT_STATUS_CLOSED,
  PROJECT_STATUS_PENDING_DELIVERY,
} from "@/lib/projects/status";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function DashboardRoutePage({params}: {params: Promise<{locale: string}>}) {
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
    .select("tenant_id, active_tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);

  if (!tenantId) {
    redirect(`/${locale}/welcome`);
  }

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);

  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const navT = await getTranslations({locale, namespace: "Navigation"});

  const closedStatuses = [...PROJECT_STATUS_CLOSED];
  const pendingDeliveryStatuses = [...PROJECT_STATUS_PENDING_DELIVERY];
  const inProgressExcluded = dashboardInProgressExcludedForQuery();

  const projectsRepo = createProjectsRepository({supabase, tenantId});

  const [inProgressRes, pendingDeliveryRes, closedRes, recentRes, totalHeadRes] = await Promise.all([
    projectsRepo.countHeadNotInStatuses(inProgressExcluded),
    projectsRepo.countHeadInStatuses(pendingDeliveryStatuses),
    projectsRepo.countHeadInStatuses(closedStatuses),
    projectsRepo.listRecentIdStatus(5),
    projectsRepo.countHeadAll(),
  ]);

  logProjectQueryError("inProgress count", inProgressRes.error, tenantId);
  logProjectQueryError("pendingDelivery count", pendingDeliveryRes.error, tenantId);
  logProjectQueryError("closed count", closedRes.error, tenantId);
  logProjectQueryError("recent list", recentRes.error, tenantId);
  logProjectQueryError("total count", totalHeadRes.error, tenantId);

  const inProgress = inProgressRes.count ?? 0;
  const pendingDelivery = pendingDeliveryRes.count ?? 0;
  const closed = closedRes.count ?? 0;
  const recent = recentRes.data ?? [];
  const totalProjects = totalHeadRes.count ?? 0;

  const tenantName = tenant?.name ?? "Workspace";

  return (
    <DashboardShell
      locale={locale}
      tenantName={tenantName}
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
      <DashboardOverviewSection
        locale={locale}
        inProgress={inProgress}
        pendingDelivery={pendingDelivery}
        closed={closed}
        recent={recent}
        totalProjects={totalProjects}
      />
    </DashboardShell>
  );
}
