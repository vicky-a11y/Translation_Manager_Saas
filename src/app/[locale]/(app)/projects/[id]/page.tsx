import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {DashboardShell} from "@/components/layout/dashboard-shell";
import {buttonVariants} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {cn} from "@/lib/utils";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";
import {ProjectFinanceEditor} from "./project-finance-editor";
import {ProjectAssignmentsEditor} from "./project-assignments-editor";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function formatDateTime(value: string | null, locale: AppLocale) {
  if (!value) return "—";
  try {
    const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
  } catch {
    return value;
  }
}

function formatMoney(value: unknown, locale: AppLocale) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
  return new Intl.NumberFormat(tag, {maximumFractionDigits: 0}).format(Number.isFinite(amount) ? amount : 0);
}

function valueOrDash(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale: localeParam, id: projectId} = await params;
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

  const {data: project} = await supabase
    .from("projects")
    .select("id, customer_id, project_code, title, created_at, delivery_deadline")
    .eq("tenant_id", tenantId)
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const [financeRes, customerRes, workspaceTenants, tenantRes] = await Promise.all([
    supabase
      .from("project_financials")
      .select(
        [
          "amount",
          "disbursement_fee",
          "taxable_total",
          "subtotal",
          "tax",
          "paid_amount",
          "remaining_amount",
          "payment_method",
          "remittance_bank_name",
          "remittance_account_last5",
          "remittance_is_counter",
          "payment_note",
        ].join(","),
      )
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("customer_master")
      .select("cid, display_name, contact_person, email, phone_mobile, phone_office, im_platform, im_id, address")
      .eq("tenant_id", tenantId)
      .eq("id", project.customer_id)
      .maybeSingle(),
    loadWorkspaceTenantOptions(supabase, user.id),
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
  ]);

  const {data: assignmentRows} = await supabase
    .from("project_translator_assignments")
    .select(
      `
      id,
      assignee_id,
      translator_fee,
      translator_deadline,
      translator_master!project_translator_assignments_assignee_fk (
        name,
        line_name
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", {ascending: true});

  const finance = financeRes.data as {
    amount: number | null;
    disbursement_fee: number | null;
    taxable_total: number | null;
    subtotal: number | null;
    tax: number | null;
    paid_amount: number | null;
    remaining_amount: number | null;
    payment_method: number | null;
    remittance_bank_name: string | null;
    remittance_account_last5: string | null;
    remittance_is_counter: boolean | null;
    payment_note: string | null;
  } | null;
  const customer = customerRes.data;
  const tenant = tenantRes.data;
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "ProjectsDetail"});

  const assignments = (assignmentRows ?? []).map((raw) => {
    const row = raw as {
      id: string;
      assignee_id: string;
      translator_fee: number;
      translator_deadline: string | null;
      translator_master?: {name?: string | null; line_name?: string | null} | Array<{name?: string | null; line_name?: string | null}> | null;
    };
    const tm = Array.isArray(row.translator_master) ? row.translator_master[0] : row.translator_master;
    const display = ((tm?.line_name ?? "") as string).trim() || ((tm?.name ?? "") as string).trim() || row.assignee_id;
    return {
      id: row.id,
      assigneeId: row.assignee_id,
      translatorLabel: display,
      translatorFee: Number(row.translator_fee ?? 0),
      translatorDeadline: row.translator_deadline,
    };
  });

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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{project.project_code}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{project.title}</h1>
          </div>
          <Link href={`/${locale}/projects`} className={cn(buttonVariants({variant: "outline"}), "shrink-0")}>
            {t("backToList")}
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("sectionProject")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("projectCode")}</dt>
                  <dd className="font-medium">{project.project_code}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("projectTitle")}</dt>
                  <dd className="font-medium">{project.title}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("createdAt")}</dt>
                  <dd className="font-medium">{formatDateTime(project.created_at, locale)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("deliveryDeadline")}</dt>
                  <dd className="font-medium">{formatDateTime(project.delivery_deadline, locale)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sectionFinance")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectFinanceEditor
                locale={locale}
                projectId={projectId}
                initial={{
                  amount: (finance?.amount as number | null) ?? null,
                  disbursementFee: (finance?.disbursement_fee as number | null) ?? null,
                  taxableTotal: (finance?.taxable_total as number | null) ?? null,
                  subtotal: (finance?.subtotal as number | null) ?? null,
                  tax: (finance?.tax as number | null) ?? null,
                  paidAmount: (finance?.paid_amount as number | null) ?? null,
                  remainingAmount: (finance?.remaining_amount as number | null) ?? null,
                  paymentMethod: (finance?.payment_method as number | null) ?? null,
                  remittanceBankName: (finance?.remittance_bank_name as string | null) ?? null,
                  remittanceAccountLast5: (finance?.remittance_account_last5 as string | null) ?? null,
                  remittanceIsCounter: (finance?.remittance_is_counter as boolean | null) ?? null,
                  paymentNote: (finance?.payment_note as string | null) ?? null,
                }}
                labels={{
                  amount: t("amount"),
                  disbursementFee: t("disbursementFee"),
                  taxableTotal: t("taxableTotal"),
                  subtotal: t("subtotal"),
                  tax: t("tax"),
                  receivedAmount: t("receivedAmount"),
                  unreceivedAmount: t("unreceivedAmount"),
                  paymentMethod: t("paymentMethod"),
                  paymentMethodUnset: t("paymentMethodUnset"),
                  paymentMethodCash: t("paymentMethodCash"),
                  paymentMethodTransfer: t("paymentMethodTransfer"),
                  paymentMethodOverseasWire: t("paymentMethodOverseasWire"),
                  paymentMethodCard: t("paymentMethodCard"),
                  paymentMethodOther: t("paymentMethodOther"),
                  remittanceBankName: t("remittanceBankName"),
                  remittanceAccountLast5: t("remittanceAccountLast5"),
                  remittanceCounter: t("remittanceCounter"),
                  paymentNote: t("paymentNote"),
                  edit: t("edit"),
                  save: t("save"),
                  saving: t("saving"),
                  cancel: t("cancel"),
                  saved: t("saved"),
                  errorValidation: t("errors.validation"),
                  errorGeneric: t("errors.database"),
                }}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("sectionCustomer")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("customerName")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.display_name)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("customerCode")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.cid)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("contactPerson")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.contact_person)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("email")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.email)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("phoneMobile")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.phone_mobile)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("phoneOffice")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.phone_office)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("im")}</dt>
                <dd className="mt-1 font-medium">
                  {customer?.im_platform || customer?.im_id
                    ? `${valueOrDash(customer?.im_platform)} / ${valueOrDash(customer?.im_id)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("address")}</dt>
                <dd className="mt-1 font-medium">{valueOrDash(customer?.address)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sectionAssignments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectAssignmentsEditor
              locale={locale}
              projectId={projectId}
              initial={assignments}
              labels={{
                heading: t("assignmentsHeading"),
                add: t("assignmentsAdd"),
                translator: t("assignmentsTranslator"),
                translatorPlaceholder: t("assignmentsTranslatorPlaceholder"),
                translatorSearching: t("assignmentsTranslatorSearching"),
                translatorNoMatches: t("assignmentsTranslatorNoMatches"),
                fee: t("assignmentsFee"),
                deadline: t("assignmentsDeadline"),
                edit: t("edit"),
                save: t("save"),
                saving: t("saving"),
                cancel: t("cancel"),
                delete: t("delete"),
                errorValidation: t("errors.validation"),
                errorGeneric: t("errors.database"),
                saved: t("saved"),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
