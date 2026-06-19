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

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function localeToBcp47(locale: AppLocale): string {
  if (locale === "zh-TW" || locale === "zh-CN") return locale;
  if (locale === "ms") return "ms-MY";
  return "en-US";
}

function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

type FinanceRow = {
  id: string;
  project_code: string | null;
  title: string;
  customer_master: {display_name: string | null} | Array<{display_name: string | null}> | null;
  project_financials:
    | {
        paid_amount: number | null;
        remaining_amount: number | null;
        disbursement_fee: number | null;
        subtotal: number | null;
        tax: number | null;
        taxable_total: number | null;
      }
    | Array<{
        paid_amount: number | null;
        remaining_amount: number | null;
        disbursement_fee: number | null;
        subtotal: number | null;
        tax: number | null;
        taxable_total: number | null;
      }>
    | null;
};

function getFinancials(row: FinanceRow) {
  const pf = Array.isArray(row.project_financials) ? row.project_financials[0] : row.project_financials;
  return {
    paid_amount: pf?.paid_amount ?? null,
    remaining_amount: pf?.remaining_amount ?? null,
    disbursement_fee: pf?.disbursement_fee ?? null,
    subtotal: pf?.subtotal ?? null,
    tax: pf?.tax ?? null,
    taxable_total: pf?.taxable_total ?? null,
  };
}

function sumCol(rows: FinanceRow[], getter: (f: ReturnType<typeof getFinancials>) => number | null): number {
  return rows.reduce((acc, row) => {
    const v = getter(getFinancials(row));
    return acc + (v ?? 0);
  }, 0);
}

export default async function FinancePage({
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
  if (!isSuper && !flags.can_view_finance) {
    redirect(`/${locale}/dashboard`);
  }

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const {data: rows} = await supabase
    .from("projects")
    .select(`
      id, project_code, title,
      customer_master(display_name),
      project_financials(paid_amount, remaining_amount, disbursement_fee, subtotal, tax, taxable_total)
    `)
    .eq("tenant_id", tenantId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", {ascending: true})
    .limit(500);

  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "Finance"});

  const list = (rows ?? []) as FinanceRow[];
  const bcp47 = localeToBcp47(locale);

  const totalPaid = sumCol(list, (f) => f.paid_amount);
  const totalRemaining = sumCol(list, (f) => f.remaining_amount);
  const totalFee = sumCol(list, (f) => f.disbursement_fee);
  const totalSubtotal = sumCol(list, (f) => f.subtotal);
  const totalTax = sumCol(list, (f) => f.tax);
  const totalTaxableTotal = sumCol(list, (f) => f.taxable_total);
  const hasAnyRemaining = list.some((r) => (getFinancials(r).remaining_amount ?? 0) > 0);

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
            href={`/${locale}/finance/vendor-settlement`}
            className={cn(buttonVariants({variant: "outline", size: "sm"}), "shrink-0")}
          >
            {t("viewSettlement")}
          </Link>
        </div>

        <YearMonthFilter year={validYear} month={validMonth} locale={locale} yearLabel={t("yearLabel")} />

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("noData")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap">{t("colProjectCode")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colTitle")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colPaidAmount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colRemainingAmount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colDisbursementFee")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colSubtotal")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colTax")}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t("colTaxableTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => {
                  const customer = Array.isArray(row.customer_master)
                    ? row.customer_master[0]
                    : row.customer_master;
                  const f = getFinancials(row);
                  const hasRemaining = (f.remaining_amount ?? 0) > 0;
                  const detailHref = `/${locale}/projects/${row.id}`;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={detailHref}
                          className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
                        >
                          {row.project_code ?? row.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[12rem] truncate">
                          <Link
                            href={detailHref}
                            className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
                            title={row.title}
                          >
                            {row.title}
                          </Link>
                        </div>
                        {customer?.display_name ? (
                          <div
                            className="max-w-[12rem] truncate text-xs text-muted-foreground"
                            title={customer.display_name}
                          >
                            {customer.display_name}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(f.paid_amount)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          hasRemaining ? "font-bold text-red-600" : "text-muted-foreground",
                        )}
                      >
                        {formatAmount(f.remaining_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatAmount(f.disbursement_fee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(f.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatAmount(f.tax)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatAmount(f.taxable_total)}</TableCell>
                    </TableRow>
                  );
                })}

                {/* 合計列 */}
                <TableRow className="border-t-2 border-border bg-muted/40 font-semibold">
                  <TableCell colSpan={2}>{t("total")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalPaid)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      hasAnyRemaining ? "font-bold text-red-600" : "",
                    )}
                  >
                    {formatAmount(totalRemaining)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalFee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalSubtotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalTax)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(totalTaxableTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat(bcp47, {year: "numeric", month: "long"}).format(
            new Date(validYear, validMonth - 1, 1),
          )}
          {" · "}
          {t("filterHint")}
        </p>
      </div>
    </DashboardShell>
  );
}
