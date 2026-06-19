"use client";

import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";

import {submitCustomerIntakeAction, type IntakePayload, type IntakeSubmitResult} from "./actions";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";
import type {AppLocale} from "@/i18n/routing";

const PROJECT_TYPES = ["doc_translation", "doc_certification", "av_transcription", "other"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = IntakePayload;

const emptyForm: FormState = {
  customer_name: "",
  phone: "",
  email: "",
  address: "",
  has_tax_invoice: false,
  tax_title: "",
  tax_id: "",
  need_shipping: false,
  shipping_name: "",
  shipping_phone: "",
  shipping_zipcode: "",
  shipping_address: "",
  intake_channel: "online_paid",
  project_type_note: "doc_translation",
  remittance_amount: "",
  remittance_bank_name: "",
  remittance_account_last5: "",
};

type Stage = "form" | "preview" | "success";

const textareaCls = cn(
  "w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);
const selectCls = cn(
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);

export function IntakeForm({
  locale: _locale,
  token,
  tenantName,
}: {
  locale: AppLocale;
  token: string;
  tenantName: string;
}) {
  const t = useTranslations("CustomerIntakePublic");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [stage, setStage] = useState<Stage>("form");
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<IntakeSubmitResult & {ok: false} | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
  }

  function goPreview() {
    setClientError(null);
    if (!form.customer_name.trim() && !form.tax_title.trim()) {
      setClientError(t("errors.missing_name"));
      return;
    }
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
      setClientError(t("errors.invalid_email"));
      return;
    }
    const last5 = form.remittance_account_last5.trim();
    if (last5 && !/^[0-9]{5}$/.test(last5)) {
      setClientError(t("errors.invalid_last5"));
      return;
    }
    setStage("preview");
  }

  function copyCustomerToShipping() {
    setForm((prev) => ({
      ...prev,
      shipping_name: prev.customer_name,
      shipping_phone: prev.phone,
      shipping_address: prev.address,
    }));
  }

  function confirmSubmit() {
    setServerError(null);
    startTransition(async () => {
      const payload: IntakePayload = {
        ...form,
        // 手冊規範：暫存表存純文字（如「認證」），非內部代碼
        project_type_note: t(`projectTypes.${form.project_type_note}`),
        tax_title: form.has_tax_invoice ? form.tax_title : "",
        tax_id: form.has_tax_invoice ? form.tax_id : "",
        shipping_name: form.need_shipping ? form.shipping_name : "",
        shipping_phone: form.need_shipping ? form.shipping_phone : "",
        shipping_zipcode: form.need_shipping ? form.shipping_zipcode : "",
        shipping_address: form.need_shipping ? form.shipping_address : "",
      };
      const result = await submitCustomerIntakeAction(token, payload);
      if (result.ok) {
        setStage("success");
      } else {
        setServerError(result);
        if (result.errorKey === "missing_name" || result.errorKey === "invalid_email" || result.errorKey === "invalid_last5") {
          setStage("form");
          setClientError(t(`errors.${result.errorKey}`));
        }
      }
    });
  }

  if (stage === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("successTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("successMessage")}</p>
        </CardContent>
      </Card>
    );
  }

  if (stage === "preview") {
    return (
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>{t("previewTitle", {tenantName})}</CardTitle>
          <CardDescription>{t("previewSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6 text-sm">
          {serverError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              {t(`errors.${serverError.errorKey}`)}
            </p>
          ) : null}
          <PreviewRow label={t("customerName")} value={form.customer_name} none={t("none")} />
          <PreviewRow label={t("phone")} value={form.phone} none={t("none")} />
          <PreviewRow label={t("email")} value={form.email} none={t("none")} />
          <PreviewRow label={t("address")} value={form.address} none={t("none")} />
          <PreviewRow
            label={t("projectTypeNote")}
            value={t(`projectTypes.${form.project_type_note}`)}
            none={t("none")}
          />
          <PreviewRow label={t("hasTaxInvoice")} value={form.has_tax_invoice ? t("yes") : t("no")} none={t("none")} />
          {form.has_tax_invoice ? (
            <>
              <PreviewRow label={t("taxTitle")} value={form.tax_title} none={t("none")} />
              <PreviewRow label={t("taxId")} value={form.tax_id} none={t("none")} />
            </>
          ) : null}
          <PreviewRow label={t("needShipping")} value={form.need_shipping ? t("yes") : t("no")} none={t("none")} />
          {form.need_shipping ? (
            <>
              <PreviewRow label={t("shippingName")} value={form.shipping_name} none={t("none")} />
              <PreviewRow label={t("shippingPhone")} value={form.shipping_phone} none={t("none")} />
              <PreviewRow label={t("shippingZipcode")} value={form.shipping_zipcode} none={t("none")} />
              <PreviewRow label={t("shippingAddress")} value={form.shipping_address} none={t("none")} />
            </>
          ) : null}
          <PreviewRow label={t("remittanceAmount")} value={form.remittance_amount} none={t("none")} />
          <PreviewRow label={t("remittanceBank")} value={form.remittance_bank_name} none={t("none")} />
          <PreviewRow label={t("remittanceLast5")} value={form.remittance_account_last5} none={t("none")} />
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm leading-relaxed text-muted-foreground">
            {t("previewNote")}
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40">
          <Button variant="outline" onClick={() => setStage("form")} disabled={isPending}>
            {t("back")}
          </Button>
          <Button onClick={confirmSubmit} disabled={isPending}>
            {isPending ? t("submitting") : t("confirmSubmit")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle>{t("formTitle")}</CardTitle>
        <CardDescription>{t("formSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {clientError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {clientError}
          </p>
        ) : null}

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionBasic")}</p>
          <div className="space-y-2">
            <Label htmlFor="customer_name">
              {t("customerName")} <span className="text-destructive">*</span>
            </Label>
            <Input id="customer_name" value={form.customer_name} maxLength={200} onChange={(e) => set("customer_name", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" value={form.phone} maxLength={50} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" value={form.email} maxLength={255} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{t("address")}</Label>
            <textarea id="address" rows={2} value={form.address} className={textareaCls} onChange={(e) => set("address", e.target.value)} />
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionChannel")}</p>
          <div className="space-y-2">
            <Label htmlFor="project_type_note">{t("projectTypeNote")}</Label>
            <select
              id="project_type_note"
              value={form.project_type_note}
              className={selectCls}
              onChange={(e) => set("project_type_note", e.target.value)}
            >
              {PROJECT_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`projectTypes.${k}`)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionInvoice")}</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.has_tax_invoice}
              onChange={(e) => set("has_tax_invoice", e.target.checked)}
            />
            {t("hasTaxInvoice")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tax_title">{t("taxTitle")}</Label>
              <Input
                id="tax_title"
                value={form.tax_title}
                maxLength={200}
                disabled={!form.has_tax_invoice}
                className={cn(!form.has_tax_invoice && "opacity-50")}
                onChange={(e) => set("tax_title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_id">{t("taxId")}</Label>
              <Input
                id="tax_id"
                value={form.tax_id}
                maxLength={50}
                disabled={!form.has_tax_invoice}
                className={cn(!form.has_tax_invoice && "opacity-50")}
                onChange={(e) => set("tax_id", e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionShipping")}</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.need_shipping}
              onChange={(e) => set("need_shipping", e.target.checked)}
            />
            {t("needShipping")}
          </label>
          {form.need_shipping ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t("shippingHint")}</p>
                <Button type="button" variant="outline" size="sm" onClick={copyCustomerToShipping}>
                  {t("sameAsCustomer")}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shipping_name">{t("shippingName")}</Label>
                  <Input id="shipping_name" value={form.shipping_name} maxLength={100} onChange={(e) => set("shipping_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping_phone">{t("shippingPhone")}</Label>
                  <Input id="shipping_phone" value={form.shipping_phone} maxLength={50} onChange={(e) => set("shipping_phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping_zipcode">{t("shippingZipcode")}</Label>
                  <Input id="shipping_zipcode" value={form.shipping_zipcode} maxLength={10} onChange={(e) => set("shipping_zipcode", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping_address">{t("shippingAddress")}</Label>
                  <Input id="shipping_address" value={form.shipping_address} maxLength={500} onChange={(e) => set("shipping_address", e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionPayment")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="remittance_amount">{t("remittanceAmount")}</Label>
              <Input
                id="remittance_amount"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.remittance_amount}
                onChange={(e) => set("remittance_amount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remittance_bank_name">{t("remittanceBank")}</Label>
              <Input id="remittance_bank_name" value={form.remittance_bank_name} maxLength={100} onChange={(e) => set("remittance_bank_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remittance_account_last5">{t("remittanceLast5")}</Label>
              <Input
                id="remittance_account_last5"
                value={form.remittance_account_last5}
                maxLength={5}
                inputMode="numeric"
                onChange={(e) => set("remittance_account_last5", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("remittanceLast5Hint")}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("uploadDisabledHint")}</p>
        </section>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 border-t border-border bg-muted/40">
        <Button onClick={goPreview}>{t("next")}</Button>
      </CardFooter>
    </Card>
  );
}

function PreviewRow({label, value, none}: {label: string; value: string; none: string}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value.trim() ? value : none}</span>
    </div>
  );
}
