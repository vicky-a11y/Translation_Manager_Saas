import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {approveIntakeSubmission, createIntakeLink, deleteIntakeSubmission} from "@/app/[locale]/actions/customer-intake";
import {IntakeLinkList, type IntakeLinkItem} from "./intake-link-list";
import {DashboardShell} from "@/components/layout/dashboard-shell";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {createClient} from "@/lib/supabase/server";
import {parsePermissions} from "@/lib/permissions/parse-permissions";
import type {ProfileRole} from "@/lib/permissions/types";
import {loadWorkspaceTenantOptions} from "@/lib/tenant/load-workspace-tenants";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

const STATUS_KEYS = new Set(["generated", "revoked", "deleted", "forbidden", "error", "duplicate_tax"]);

type SubmissionRow = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  has_tax_invoice: boolean;
  tax_title: string | null;
  tax_id: string | null;
  need_shipping: boolean;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_zipcode: string | null;
  shipping_address: string | null;
  intake_channel: string | null;
  project_type_note: string | null;
  remittance_amount: number | null;
  remittance_bank_name: string | null;
  remittance_account_last5: string | null;
  created_at: string;
};

function fmtTs(iso: string, locale: AppLocale) {
  try {
    const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function CustomerIntakeAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{status?: string}>;
}) {
  const {locale: localeParam} = await params;
  const {status} = await searchParams;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  const statusKey = status && STATUS_KEYS.has(status) ? status : null;

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

  const {data: linkRows} = await supabase
    .from("customer_intake_links")
    .select("id, token, label, is_active")
    .eq("tenant_id", tenantId)
    .order("created_at", {ascending: false});

  const {data: subRows} = await supabase
    .from("customer_intake_submissions")
    .select(
      "id, customer_name, phone, email, address, has_tax_invoice, tax_title, tax_id, need_shipping, shipping_name, shipping_phone, shipping_zipcode, shipping_address, intake_channel, project_type_note, remittance_amount, remittance_bank_name, remittance_account_last5, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", {ascending: false});

  const links = (linkRows ?? []) as IntakeLinkItem[];
  const submissions = (subRows ?? []) as SubmissionRow[];

  const workspaceTenants = await loadWorkspaceTenantOptions(supabase, user.id);
  const {data: tenant} = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const navT = await getTranslations({locale, namespace: "Navigation"});
  const t = await getTranslations({locale, namespace: "CustomerIntakeAdmin"});

  const statusMessage =
    statusKey === "generated"
      ? t("statusGenerated")
      : statusKey === "revoked"
        ? t("statusRevoked")
        : statusKey === "deleted"
          ? t("statusDeleted")
          : statusKey === "duplicate_tax"
            ? t("duplicateTax")
            : statusKey === "error"
              ? t("approveError")
              : null;
  const statusIsError = statusKey === "duplicate_tax" || statusKey === "error" || statusKey === "forbidden";

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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {statusMessage ? (
          <p
            className={
              statusIsError
                ? "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            }
          >
            {statusMessage}
          </p>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold">{t("linkHeading")}</h2>
          <form action={createIntakeLink} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="locale" value={locale} />
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="intake-label">
                {t("linkLabelField")}
              </label>
              <Input id="intake-label" name="label" maxLength={200} placeholder={t("linkLabelPlaceholder")} />
            </div>
            <Button type="submit">{t("generateLink")}</Button>
          </form>
          <IntakeLinkList locale={locale} links={links} />
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold">{t("listHeading")}</h2>
          {submissions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("noPending")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {submissions.map((s) => {
                const name = (s.customer_name ?? "").trim() || (s.tax_title ?? "").trim() || "—";
                const channel = s.intake_channel ? t(`channels.${s.intake_channel}`) : t("none");
                return (
                  <li key={s.id} className="rounded-lg border border-border p-4">
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                        <span className="font-medium">{name}</span>
                        <span className="text-xs text-muted-foreground">
                          {channel} · {s.project_type_note?.trim() || t("none")} · {fmtTs(s.created_at, locale)}
                        </span>
                      </summary>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <Field label={t("fieldPhone")} value={s.phone} none={t("none")} />
                        <Field label={t("fieldEmail")} value={s.email} none={t("none")} />
                        <Field label={t("fieldAddress")} value={s.address} none={t("none")} />
                        <Field
                          label={t("fieldInvoice")}
                          value={s.has_tax_invoice ? t("yes") : t("no")}
                          none={t("none")}
                        />
                        {s.has_tax_invoice ? (
                          <>
                            <Field label={t("fieldTaxTitle")} value={s.tax_title} none={t("none")} />
                            <Field label={t("fieldTaxId")} value={s.tax_id} none={t("none")} />
                          </>
                        ) : null}
                        <Field label={t("fieldProjectType")} value={s.project_type_note} none={t("none")} />
                        <Field
                          label={t("colAmount")}
                          value={s.remittance_amount != null ? String(s.remittance_amount) : null}
                          none={t("none")}
                        />
                        <Field label={t("fieldRemittanceBank")} value={s.remittance_bank_name} none={t("none")} />
                        <Field label={t("fieldRemittanceLast5")} value={s.remittance_account_last5} none={t("none")} />
                        {s.need_shipping ? (
                          <Field
                            label={t("fieldShipping")}
                            value={[s.shipping_name, s.shipping_phone, s.shipping_zipcode, s.shipping_address]
                              .filter((v) => v && v.trim())
                              .join(" / ")}
                            none={t("none")}
                          />
                        ) : null}
                      </dl>
                    </details>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <form action={deleteIntakeSubmission}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="submission_id" value={s.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t("delete")}
                        </Button>
                      </form>
                      <form action={approveIntakeSubmission}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="submission_id" value={s.id} />
                        <Button type="submit" size="sm">
                          {t("approve")}
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function Field({label, value, none}: {label: string; value: string | null; none: string}) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value && value.trim() ? value : none}</dd>
    </div>
  );
}
