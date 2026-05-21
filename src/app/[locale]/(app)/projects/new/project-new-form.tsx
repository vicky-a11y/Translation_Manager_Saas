"use client";

import Link from "next/link";
import {useActionState, useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";

import {createProjectAction, type CreateProjectFormState} from "./actions";
import {searchActiveCustomersAction, type CustomerSearchOption} from "./search-customers-action";
import {Button, buttonVariants} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {computeFinancialBreakdown} from "@/lib/finance/financial-logic";
import {cn} from "@/lib/utils";
import type {AppLocale} from "@/i18n/routing";

const initialActionState: CreateProjectFormState = {};

type ProjectNewFormProps = {
  locale: AppLocale;
  hasCustomers: boolean;
};

function formatCustomerLabel(c: CustomerSearchOption) {
  return c.cid ? `${c.displayName} (${c.cid})` : c.displayName;
}

function formatNowForDisplay(locale: AppLocale) {
  const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
  return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date());
}

function parseMoney(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number, locale: AppLocale) {
  const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
  return new Intl.NumberFormat(tag, {maximumFractionDigits: 0}).format(value);
}

export function ProjectNewForm({locale, hasCustomers}: ProjectNewFormProps) {
  const t = useTranslations("ProjectsNew");
  const [state, formAction, isPending] = useActionState(createProjectAction, initialActionState);
  const createdAtPreview = useMemo(() => formatNowForDisplay(locale), [locale]);
  const [amount, setAmount] = useState("");
  const [disbursementFee, setDisbursementFee] = useState("");
  const breakdown = useMemo(
    () =>
      computeFinancialBreakdown({
        totalAmount: parseMoney(amount),
        disbursementFee: parseMoney(disbursementFee),
        paidAmount: 0,
      }),
    [amount, disbursementFee],
  );

  const [customerInput, setCustomerInput] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [committedLabel, setCommittedLabel] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerSearchOption[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [searchHadNoMatch, setSearchHadNoMatch] = useState(false);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    const q = customerInput.trim();
    if (committedLabel !== null && customerInput === committedLabel) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSearchHadNoMatch(false);
      return;
    }

    if (q.length < 1) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSearchHadNoMatch(false);
      return;
    }

    const id = window.setTimeout(() => {
      void (async () => {
        setSuggestLoading(true);
        setSearchHadNoMatch(false);
        try {
          const rows = await searchActiveCustomersAction(q);
          setSuggestions(rows);
          setSuggestOpen(rows.length > 0);
          setSearchHadNoMatch(rows.length === 0);
        } finally {
          setSuggestLoading(false);
        }
      })();
    }, 280);

    return () => window.clearTimeout(id);
  }, [customerInput, committedLabel]);

  function pickCustomer(c: CustomerSearchOption) {
    const label = formatCustomerLabel(c);
    setCustomerId(c.id);
    setCommittedLabel(label);
    setCustomerInput(label);
    setSuggestions([]);
    setSuggestOpen(false);
    setSearchHadNoMatch(false);
  }

  function onCustomerInputChange(value: string) {
    setCustomerInput(value);
    if (committedLabel !== null && value !== committedLabel) {
      setCommittedLabel(null);
      setCustomerId("");
    }
  }

  const canSubmit = hasCustomers && Boolean(customerId.trim());

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="border-b border-border">
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {state.errorKey ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(`errors.${state.errorKey}`)}
          </p>
        ) : null}

        {!hasCustomers ? (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("noCustomers")}
          </p>
        ) : null}

        <form id="project-new-form" action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="customer_id" value={customerId} readOnly />

          <div className="space-y-2">
            <Label htmlFor="customer_search">
              {t("customer")} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="customer_search"
                name="customer_search"
                autoComplete="off"
                placeholder={t("customerSearchPlaceholder")}
                value={customerInput}
                disabled={!hasCustomers}
                aria-autocomplete="list"
                aria-expanded={suggestOpen}
                aria-controls="customer-suggestions"
                onChange={(e) => onCustomerInputChange(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestOpen(true);
                }}
                onBlur={() => {
                  blurTimer.current = window.setTimeout(() => setSuggestOpen(false), 180);
                }}
                className={cn(!hasCustomers && "opacity-50")}
              />
              {suggestLoading ? (
                <p className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {t("customerSearching")}
                </p>
              ) : null}

              {hasCustomers && suggestOpen && suggestions.length > 0 ? (
                <ul
                  id="customer-suggestions"
                  role="listbox"
                  className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
                >
                  {suggestions.map((c) => (
                    <li key={c.id} role="option">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (blurTimer.current) window.clearTimeout(blurTimer.current);
                          pickCustomer(c);
                        }}
                      >
                        {formatCustomerLabel(c)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {hasCustomers &&
              !suggestLoading &&
              customerInput.trim().length > 0 &&
              searchHadNoMatch &&
              suggestions.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("customerNoMatches")}</p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("customerSearchHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="created_at_preview">{t("createdAt")}</Label>
            <Input id="created_at_preview" value={createdAtPreview} disabled readOnly />
            <p className="text-xs text-muted-foreground">{t("createdAtHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_code">
              {t("projectCode")} <span className="text-destructive">*</span>
            </Label>
            <Input id="project_code" name="project_code" required maxLength={50} autoComplete="off" />
            <p className="text-xs text-muted-foreground">{t("projectCodeHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              {t("projectTitle")} <span className="text-destructive">*</span>
            </Label>
            <Input id="title" name="title" required maxLength={200} autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery_deadline">
              {t("deliveryDeadline")} <span className="text-destructive">*</span>
            </Label>
            <Input id="delivery_deadline" name="delivery_deadline" type="datetime-local" required />
          </div>

          <section className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionFinance")}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">
                  {t("amount")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="1"
                  required
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disbursement_fee">{t("disbursementFee")}</Label>
                <Input
                  id="disbursement_fee"
                  name="disbursement_fee"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={disbursementFee}
                  onChange={(event) => setDisbursementFee(event.target.value)}
                />
              </div>
            </div>

            <dl className="grid gap-3 rounded-lg bg-background p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t("taxableTotal")}</dt>
                <dd className="mt-1 font-medium">{formatMoney(breakdown.taxableTotal, locale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("subtotal")}</dt>
                <dd className="mt-1 font-medium">{formatMoney(breakdown.subtotal, locale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("tax")}</dt>
                <dd className="mt-1 font-medium">{formatMoney(breakdown.tax, locale)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{t("taxHint")}</p>
          </section>
        </form>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40">
        <Link href={`/${locale}/projects`} className={cn(buttonVariants({variant: "outline", size: "default"}))}>
          {t("cancel")}
        </Link>
        <Button type="submit" form="project-new-form" disabled={isPending || !canSubmit}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
