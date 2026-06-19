import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {YearMonthFilter} from "@/components/ui/year-month-filter";
import {buttonVariants} from "@/components/ui/button";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {cn} from "@/lib/utils";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {VendorSettlementToolbar} from "./vendor-settlement-toolbar";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

type SettlementRow = {
  assignee_id: string;
  translator_name: string | null;
  translator_line_name: string | null;
  project_count: number | null;
  total_fee: number | null;
  pending_count: number | null;
  pending_fee: number | null;
  settled_count: number | null;
  settled_fee: number | null;
};

export default async function VendorSettlementPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{year?: string; month?: string; assignee?: string}>;
}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const {year: yearParam, month: monthParam, assignee: assigneeParam} = await searchParams;
  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;
  const validYear = Number.isFinite(year) ? year : now.getFullYear();
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
  const payoutMonth = `${validYear}-${pad2(validMonth)}-01`;

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
  if (!isSuper && !flags.can_view_finance) {
    redirect(`/${locale}/dashboard`);
  }

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const {data: rows} = await supabase
    .from("v_finance_translator_monthly_settlement")
    .select(
      "assignee_id, translator_name, translator_line_name, project_count, total_fee, pending_count, pending_fee, settled_count, settled_fee",
    )
    .eq("tenant_id", tenantId)
    .eq("payout_month", payoutMonth)
    .order("total_fee", {ascending: false});

  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "FinanceVendorSettlement"});

  const allRows = (rows ?? []) as SettlementRow[];
  const selectedAssignee = assigneeParam && assigneeParam !== "all" ? assigneeParam : null;
  const list = selectedAssignee ? allRows.filter((r) => r.assignee_id === selectedAssignee) : allRows;

  const translatorOptions = allRows.map((r) => ({
    value: r.assignee_id,
    label: r.translator_name ? `${r.translator_name} (${r.assignee_id})` : r.assignee_id,
  }));

  const sum = (getter: (r: SettlementRow) => number | null | undefined) =>
    list.reduce((acc, r) => acc + (getter(r) ?? 0), 0);
  const totalProjectCount = sum((r) => r.project_count);
  const totalPendingFee = sum((r) => r.pending_fee);
  const totalSettledFee = sum((r) => r.settled_fee);
  const totalFee = sum((r) => r.total_fee);

  const monthLabel = `${validYear}-${pad2(validMonth)}`;
  const exportRows = list.map((r) => ({
    translator: r.translator_name ?? r.assignee_id,
    assigneeId: r.assignee_id,
    lineName: r.translator_line_name ?? "",
    projectCount: r.project_count ?? 0,
    pendingFee: r.pending_fee ?? 0,
    settledFee: r.settled_fee ?? 0,
    totalFee: r.total_fee ?? 0,
  }));

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Link
            href={`/${locale}/finance`}
            className={cn(buttonVariants({variant: "outline", size: "sm"}), "shrink-0")}
          >
            {t("backToFinance")}
          </Link>
        </div>

        <YearMonthFilter year={validYear} month={validMonth} locale={locale} yearLabel={t("yearLabel")} />

        <VendorSettlementToolbar
          locale={locale}
          year={validYear}
          month={validMonth}
          selectedAssignee={selectedAssignee ?? "all"}
          options={translatorOptions}
          monthLabel={monthLabel}
          rows={exportRows}
          labels={{
            translatorLabel: t("translatorFilterLabel"),
            allTranslators: t("allTranslators"),
            export: t("export"),
            csvHeaders: {
              translator: t("colTranslator"),
              assigneeId: t("colAssigneeId"),
              lineName: t("colLineName"),
              projectCount: t("colProjectCount"),
              pendingFee: t("colPendingFee"),
              settledFee: t("colSettledFee"),
              totalFee: t("colTotalFee"),
            },
          }}
        />

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("noData")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap">{t("colTranslator")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colProjectCount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colPendingCount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colPendingFee")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colSettledFee")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colTotalFee")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => {
                  const hasPending = (row.pending_fee ?? 0) > 0;
                  return (
                    <TableRow key={row.assignee_id}>
                      <TableCell className="font-medium">
                        <div>{row.translator_name ?? row.assignee_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.assignee_id}
                          {row.translator_line_name ? ` · ${row.translator_line_name}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.project_count ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.pending_count ?? 0}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          hasPending ? "font-bold text-red-600" : "text-muted-foreground",
                        )}
                      >
                        {formatAmount(row.pending_fee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatAmount(row.settled_fee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatAmount(row.total_fee)}
                      </TableCell>
                    </TableRow>
                  );
                })}

                <TableRow className="border-t-2 border-border bg-muted/40 font-semibold">
                  <TableCell>{t("total")}</TableCell>
                  <TableCell className="text-right tabular-nums">{totalProjectCount}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums font-bold text-red-600">
                    {formatAmount(totalPendingFee)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalSettledFee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalFee)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {monthLabel}
          {" · "}
          {t("filterHint")}
        </p>
      </div>
    </DashboardShell>
  );
}
