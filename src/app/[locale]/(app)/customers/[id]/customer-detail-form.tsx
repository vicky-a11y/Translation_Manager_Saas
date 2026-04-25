"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useActionState, useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";

import {updateCustomerAction, type UpdateCustomerFormState} from "./actions";
import {Button, buttonVariants} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {
  CUSTOMER_COUNTRY_CODES,
  IM_PLATFORMS,
  defaultImPlatformForCountry,
  defaultInvoiceTypeForCustomerType,
  isEnterpriseCustomerType,
} from "@/lib/customers/customer-creation-rules";
import {cn} from "@/lib/utils";
import type {AppLocale} from "@/i18n/routing";

export type CustomerDetailDTO = {
  id: string;
  cid: string | null;
  customer_type: number | null;
  legal_name: string | null;
  display_name: string;
  tax_id: string | null;
  invoice_type: number | null;
  country_code: string | null;
  status: number;
  contact_person: string | null;
  email: string | null;
  phone_mobile: string | null;
  phone_office: string | null;
  address: string | null;
  remark: string | null;
  im_platform: string | null;
  im_id: string | null;
  internal_tags: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const initialUpdateState: UpdateCustomerFormState = {};

type UxMode = "standard" | "foreign_individual";

function formatTs(iso: string, locale: AppLocale) {
  try {
    const tag =
      locale === "zh-TW" || locale === "zh-CN"
        ? locale
        : locale === "ms"
          ? "ms-MY"
          : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(iso));
  } catch {
    return iso;
  }
}

type CustomerDetailFormProps = {
  locale: AppLocale;
  customer: CustomerDetailDTO;
};

export function CustomerDetailForm({locale, customer}: CustomerDetailFormProps) {
  const t = useTranslations("CustomersDetail");
  const tNew = useTranslations("CustomersNew");
  const tc = useTranslations("CustomerCountries");
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updateCustomerAction, initialUpdateState);
  const [isActive, setIsActive] = useState(customer.is_active);
  const [showSaved, setShowSaved] = useState(false);

  const initialType = customer.customer_type != null ? customer.customer_type : 1;
  const [uxMode, setUxMode] = useState<UxMode>(initialType === 3 ? "foreign_individual" : "standard");
  const [customerType, setCustomerType] = useState(initialType);
  const [countryCode, setCountryCode] = useState(customer.country_code?.toUpperCase() ?? "TW");
  const [imPlatform, setImPlatform] = useState(
    () => customer.im_platform ?? defaultImPlatformForCountry(customer.country_code?.toUpperCase() ?? "TW"),
  );
  const [legalLen, setLegalLen] = useState((customer.legal_name ?? "").length);
  const [remarkLen, setRemarkLen] = useState((customer.remark ?? "").length);

  const effectiveType = uxMode === "foreign_individual" ? 3 : customerType;
  const showEnterpriseTax = isEnterpriseCustomerType(effectiveType);
  const defaultInvoice = useMemo(() => defaultInvoiceTypeForCustomerType(effectiveType), [effectiveType]);
  const storedInvoice = customer.invoice_type;
  const resolvedInvoiceDefault =
    storedInvoice != null && [1, 2, 4, 5].includes(storedInvoice) ? storedInvoice : defaultInvoice;

  useEffect(() => {
    setIsActive(customer.is_active);
  }, [customer.is_active, customer.updated_at]);

  useEffect(() => {
    if (state.saved) {
      setShowSaved(true);
      router.refresh();
      const timer = window.setTimeout(() => setShowSaved(false), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [state.saved, router]);

  const base = `/${locale}`;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="border-b border-border">
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("metaCreated", {time: formatTs(customer.created_at, locale)})} ·{" "}
          {t("metaUpdated", {time: formatTs(customer.updated_at, locale)})}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {showSaved ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-100">
            {t("saved")}
          </p>
        ) : null}
        {state.errorKey && state.errorKey !== "duplicate_tax" && state.errorKey !== "duplicate_im" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.errorKey === "validation" ? tNew("errors.validation") : t(`errors.${state.errorKey}`)}
          </p>
        ) : null}
        {state.errorKey === "duplicate_tax" && state.duplicateExistingId ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("errors.duplicate_tax")}{" "}
            <Link
              href={`/${locale}/customers/${state.duplicateExistingId}`}
              className="font-medium underline underline-offset-2"
            >
              {t("errors.duplicate_taxLink")}
            </Link>
          </p>
        ) : null}
        {state.errorKey === "duplicate_im" && state.duplicateExistingId ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {tNew("errors.duplicate_im")}{" "}
            <Link
              href={`/${locale}/customers/${state.duplicateExistingId}`}
              className="font-medium underline underline-offset-2"
            >
              {tNew("errors.duplicate_imLink")}
            </Link>
          </p>
        ) : null}

        <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              uxMode === "standard"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setUxMode("standard");
              setCustomerType(1);
            }}
          >
            {tNew("tabStandard")}
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              uxMode === "foreign_individual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setUxMode("foreign_individual");
            }}
          >
            {tNew("tabForeignIndividual")}
          </button>
        </div>

        <form id="customer-detail-form" action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="customer_id" value={customer.id} />
          <input type="hidden" name="is_active" value={isActive ? "1" : "0"} />

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{t("isActive")}</p>
              <p className="text-xs text-muted-foreground">{t("isActiveHint")}</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isPending} />
          </div>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tNew("sectionIdentity")}</p>

            {uxMode === "foreign_individual" ? (
              <input type="hidden" name="customer_type" value="3" />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="customer_type">
                  {tNew("customerType")} <span className="text-destructive">*</span>
                </Label>
                <select
                  id="customer_type"
                  name="customer_type"
                  required
                  className={cn(
                    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  )}
                  value={customerType}
                  onChange={(e) => setCustomerType(Number(e.target.value))}
                >
                  <option value={1}>{tNew("customerTypes.domestic_individual")}</option>
                  <option value={2}>{tNew("customerTypes.domestic_company")}</option>
                  <option value={3}>{tNew("customerTypes.foreign_individual")}</option>
                  <option value={4}>{tNew("customerTypes.foreign_company")}</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="legal_name">
                {uxMode === "foreign_individual" || effectiveType === 3 ? tNew("legalNameForeignIndividual") : tNew("legalName")}
                <span className="text-destructive"> *</span>
              </Label>
              <Input
                id="legal_name"
                name="legal_name"
                required
                maxLength={200}
                defaultValue={customer.legal_name ?? ""}
                autoComplete="name"
                onInput={(e) => setLegalLen((e.target as HTMLInputElement).value.length)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{tNew("legalNameHint")}</span>
                <span aria-live="polite">
                  {legalLen}/200
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">
                {tNew("displayName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="display_name"
                name="display_name"
                required
                maxLength={100}
                defaultValue={customer.display_name}
                autoComplete="nickname"
              />
              <p className="text-xs text-muted-foreground">{tNew("displayNameHint")}</p>
            </div>

            {showEnterpriseTax ? (
              <div className="space-y-2">
                <Label htmlFor="tax_id">
                  {tNew("taxId")}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input id="tax_id" name="tax_id" maxLength={50} defaultValue={customer.tax_id ?? ""} autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  {countryCode === "TW" && showEnterpriseTax ? tNew("taxIdTwEnterpriseHint") : tNew("taxIdHint")}
                </p>
              </div>
            ) : (
              <input type="hidden" name="tax_id" value="" />
            )}
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tNew("sectionRegion")}</p>

            <div className="space-y-2">
              <Label htmlFor="country_code">
                {tNew("country")} <span className="text-destructive">*</span>
              </Label>
              <select
                id="country_code"
                name="country_code"
                required
                className={cn(
                  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
                value={countryCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setCountryCode(next);
                  setImPlatform(defaultImPlatformForCountry(next));
                }}
              >
                {CUSTOMER_COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {tc(code)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="im_platform">
                {tNew("imPlatform")} <span className="text-destructive">*</span>
              </Label>
              <select
                id="im_platform"
                name="im_platform"
                required
                className={cn(
                  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
                value={imPlatform}
                onChange={(e) => setImPlatform(e.target.value)}
              >
                {IM_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {tNew(`imPlatforms.${p}`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{tNew("imPlatformHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="im_id">
                {tNew("imId")} <span className="text-destructive">*</span>
              </Label>
              <Input id="im_id" name="im_id" required maxLength={100} defaultValue={customer.im_id ?? ""} autoComplete="off" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{tNew("email")}</Label>
              <Input id="email" name="email" type="email" maxLength={255} defaultValue={customer.email ?? ""} />
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tNew("sectionBilling")}</p>

            <fieldset
              key={`invoice-${effectiveType}-${customer.updated_at}`}
              className="space-y-2"
            >
              <legend className="mb-2 text-sm font-medium">
                {tNew("invoiceType")} <span className="text-destructive">*</span>
              </legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {(
                  [
                    {v: 1, k: "duplicate"},
                    {v: 2, k: "triplicate"},
                    {v: 5, k: "donation"},
                    {v: 4, k: "foreign"},
                  ] as const
                ).map(({v, k}) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="invoice_type"
                      value={String(v)}
                      defaultChecked={v === resolvedInvoiceDefault}
                      required
                    />
                    {tNew(`invoiceTypes.${k}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="internal_tags">{tNew("internalTags")}</Label>
              <Input id="internal_tags" name="internal_tags" maxLength={2000} defaultValue={customer.internal_tags ?? ""} />
              <p className="text-xs text-muted-foreground">{tNew("internalTagsHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remark">{tNew("remark")}</Label>
              <textarea
                id="remark"
                name="remark"
                rows={3}
                maxLength={2000}
                defaultValue={customer.remark ?? ""}
                onInput={(e) => setRemarkLen((e.target as HTMLTextAreaElement).value.length)}
                className={cn(
                  "w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "dark:bg-input/30",
                )}
              />
              <div className="text-end text-xs text-muted-foreground" aria-live="polite">
                {remarkLen}/2000
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tNew("sectionOptional")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cid">{tNew("cid")}</Label>
                <Input id="cid" name="cid" maxLength={20} defaultValue={customer.cid ?? ""} autoComplete="off" placeholder={tNew("cidPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_person">{tNew("contactPerson")}</Label>
                <Input
                  id="contact_person"
                  name="contact_person"
                  maxLength={100}
                  defaultValue={customer.contact_person ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone_mobile">{tNew("phoneMobile")}</Label>
                <Input id="phone_mobile" name="phone_mobile" maxLength={50} defaultValue={customer.phone_mobile ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_office">{tNew("phoneOffice")}</Label>
                <Input id="phone_office" name="phone_office" maxLength={50} defaultValue={customer.phone_office ?? ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">{tNew("address")}</Label>
              <textarea
                id="address"
                name="address"
                rows={2}
                defaultValue={customer.address ?? ""}
                className={cn(
                  "w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "dark:bg-input/30",
                )}
              />
            </div>
          </section>
        </form>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40">
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/customers`} className={cn(buttonVariants({variant: "outline", size: "default"}))}>
            {t("backToList")}
          </Link>
          <Link href={`${base}/customers/new`} className={cn(buttonVariants({variant: "secondary", size: "default"}))}>
            {t("addAnother")}
          </Link>
        </div>
        <Button type="submit" form="customer-detail-form" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
