"use client";

import Link from "next/link";
import {useActionState, useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";

import {createCustomerAction, type CreateCustomerFormState} from "./actions";
import {Button, buttonVariants} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
  CUSTOMER_COUNTRY_CODES,
  IM_PLATFORMS,
  defaultImPlatformForCountry,
  defaultInvoiceTypeForCustomerType,
  isEnterpriseCustomerType,
} from "@/lib/customers/customer-creation-rules";
import {cn} from "@/lib/utils";
import type {AppLocale} from "@/i18n/routing";

const initialActionState: CreateCustomerFormState = {};

type CustomerNewFormProps = {
  locale: AppLocale;
};

type UxMode = "standard" | "foreign_individual";

export function CustomerNewForm({locale}: CustomerNewFormProps) {
  const t = useTranslations("CustomersNew");
  const tc = useTranslations("CustomerCountries");
  const [state, formAction, isPending] = useActionState(createCustomerAction, initialActionState);

  const [uxMode, setUxMode] = useState<UxMode>("standard");
  const [customerType, setCustomerType] = useState(1);
  const [countryCode, setCountryCode] = useState<string>("TW");
  const [imPlatform, setImPlatform] = useState<string>(() => defaultImPlatformForCountry("TW"));
  const [legalLen, setLegalLen] = useState(0);
  const [remarkLen, setRemarkLen] = useState(0);

  const effectiveType = uxMode === "foreign_individual" ? 3 : customerType;
  const showEnterpriseTax = isEnterpriseCustomerType(effectiveType);
  const defaultInvoice = useMemo(() => defaultInvoiceTypeForCustomerType(effectiveType), [effectiveType]);

  useEffect(() => {
    setImPlatform(defaultImPlatformForCountry(countryCode));
  }, [countryCode]);

  const base = `/${locale}`;
  const cancelHref = `${base}/customers`;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="border-b border-border">
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {state.errorKey && state.errorKey !== "duplicate_tax" && state.errorKey !== "duplicate_im" ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(`errors.${state.errorKey}`)}
          </p>
        ) : null}
        {state.errorKey === "duplicate_tax" && state.duplicateExistingId ? (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
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
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("errors.duplicate_im")}{" "}
            <Link
              href={`/${locale}/customers/${state.duplicateExistingId}`}
              className="font-medium underline underline-offset-2"
            >
              {t("errors.duplicate_imLink")}
            </Link>
          </p>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-1">
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
            {t("tabStandard")}
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
            {t("tabForeignIndividual")}
          </button>
        </div>

        <form id="customer-new-form" action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="is_active" value="1" />

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionIdentity")}</p>

            {uxMode === "foreign_individual" ? (
              <input type="hidden" name="customer_type" value="3" />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="customer_type">
                  {t("customerType")} <span className="text-destructive">*</span>
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
                  <option value={1}>{t("customerTypes.domestic_individual")}</option>
                  <option value={2}>{t("customerTypes.domestic_company")}</option>
                  <option value={3}>{t("customerTypes.foreign_individual")}</option>
                  <option value={4}>{t("customerTypes.foreign_company")}</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="legal_name">
                {uxMode === "foreign_individual" || effectiveType === 3 ? t("legalNameForeignIndividual") : t("legalName")}
                <span className="text-destructive"> *</span>
              </Label>
              <Input
                id="legal_name"
                name="legal_name"
                required
                maxLength={200}
                autoComplete="name"
                onInput={(e) => setLegalLen((e.target as HTMLInputElement).value.length)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("legalNameHint")}</span>
                <span aria-live="polite">
                  {legalLen}/200
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">{t("displayName")}</Label>
              <Input id="display_name" name="display_name" maxLength={100} autoComplete="nickname" />
              <p className="text-xs text-muted-foreground">{t("displayNameHint")}</p>
            </div>

            {showEnterpriseTax ? (
              <div className="space-y-2">
                <Label htmlFor="tax_id">
                  {t("taxId")}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input id="tax_id" name="tax_id" maxLength={50} autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  {countryCode === "TW" && showEnterpriseTax ? t("taxIdTwEnterpriseHint") : t("taxIdHint")}
                </p>
              </div>
            ) : (
              <input type="hidden" name="tax_id" value="" />
            )}
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionRegion")}</p>

            <div className="space-y-2">
              <Label htmlFor="country_code">
                {t("country")} <span className="text-destructive">*</span>
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
                onChange={(e) => setCountryCode(e.target.value)}
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
                {t("imPlatform")} <span className="text-destructive">*</span>
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
                    {t(`imPlatforms.${p}`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("imPlatformHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="im_id">
                {t("imId")} <span className="text-destructive">*</span>
              </Label>
              <Input id="im_id" name="im_id" required maxLength={100} autoComplete="off" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" maxLength={255} autoComplete="email" />
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionBilling")}</p>

            <fieldset key={`invoice-${effectiveType}-${defaultInvoice}`} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                {t("invoiceType")} <span className="text-destructive">*</span>
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
                    <input type="radio" name="invoice_type" value={String(v)} defaultChecked={v === defaultInvoice} />
                    {t(`invoiceTypes.${k}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="internal_tags">{t("internalTags")}</Label>
              <Input id="internal_tags" name="internal_tags" maxLength={2000} autoComplete="off" />
              <p className="text-xs text-muted-foreground">{t("internalTagsHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remark">{t("remark")}</Label>
              <textarea
                id="remark"
                name="remark"
                rows={3}
                maxLength={2000}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionOptional")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cid">{t("cid")}</Label>
                <Input id="cid" name="cid" maxLength={20} autoComplete="off" placeholder={t("cidPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_person">{t("contactPerson")}</Label>
                <Input id="contact_person" name="contact_person" maxLength={100} autoComplete="name" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone_mobile">{t("phoneMobile")}</Label>
                <Input id="phone_mobile" name="phone_mobile" maxLength={50} autoComplete="tel" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_office">{t("phoneOffice")}</Label>
                <Input id="phone_office" name="phone_office" maxLength={50} autoComplete="tel" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">{t("address")}</Label>
              <textarea
                id="address"
                name="address"
                rows={2}
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
      <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40">
        <Link href={cancelHref} className={cn(buttonVariants({variant: "outline", size: "default"}))}>
          {t("cancel")}
        </Link>
        <Button type="submit" form="customer-new-form" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
