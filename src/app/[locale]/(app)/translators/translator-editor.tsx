"use client";

import Link from "next/link";
import {useActionState, useMemo, useState} from "react";
import {useTranslations} from "next-intl";

import {Button, buttonVariants} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Dialog, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";
import type {AppLocale} from "@/i18n/routing";

import {
  createTranslatorAction,
  deleteTranslatorAction,
  disableTranslatorAction,
  type TranslatorFormState,
  updateTranslatorAction,
} from "./actions";

type Mode = "new" | "edit";

type TranslatorEditorProps = {
  locale: AppLocale;
  mode: Mode;
  initial?: Record<string, unknown>;
};

function valueOf(initial: Record<string, unknown> | undefined, key: string) {
  const v = initial?.[key];
  return v == null ? "" : String(v);
}

function dateToYmdSlashes(value: unknown) {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return "";
  // try keep YYYY-MM-DD
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return raw;
}

const SERVICE_TAG_ROWS = [
  {code: "TR-EN-ZH" as const, labelKey: "serviceTagTrEnZh" as const},
  {code: "TR-ZH-EN" as const, labelKey: "serviceTagTrZhEn" as const},
  {code: "TS-ZH" as const, labelKey: "serviceTagTsZh" as const},
  {code: "DTP" as const, labelKey: "serviceTagDtp" as const},
  {code: "VE" as const, labelKey: "serviceTagVe" as const},
];

/** 與 `CustomerCountries` 鍵一致；國籍儲存為二碼代碼 */
const CUSTOMER_COUNTRY_CODES = [
  "TW",
  "CN",
  "HK",
  "MY",
  "SG",
  "ID",
  "TH",
  "VN",
  "PH",
  "JP",
  "KR",
  "US",
  "GB",
  "DE",
  "FR",
  "AU",
] as const;

const selectFieldClass = cn(
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

function parseServiceTags(raw: unknown): string[] {
  const fallback = ["TR-EN-ZH"];
  if (raw == null || raw === "") return fallback;
  if (Array.isArray(raw)) {
    const tags = raw.map((x) => String(x).trim()).filter(Boolean);
    return tags.length ? tags : fallback;
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const tags = Array.isArray(parsed) ? parsed.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
    return tags.length ? tags : fallback;
  } catch {
    return fallback;
  }
}

export function TranslatorEditor({locale, mode, initial}: TranslatorEditorProps) {
  const t = useTranslations("TranslatorsEditor");
  const tCountries = useTranslations("CustomerCountries");
  const id = valueOf(initial, "id");
  const translatorIdValue = valueOf(initial, "translator_id");

  const initialTags = useMemo(() => parseServiceTags(initial?.service_tags), [initial]);
  const [serviceTags, setServiceTags] = useState<string[]>(initialTags);

  const nationalityInitial = valueOf(initial, "nationality");
  const nationalityOptions = useMemo(() => {
    const base = [...CUSTOMER_COUNTRY_CODES];
    if (nationalityInitial && !(CUSTOMER_COUNTRY_CODES as readonly string[]).includes(nationalityInitial)) {
      return [nationalityInitial, ...base];
    }
    return base;
  }, [nationalityInitial]);

  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const initialActionState: TranslatorFormState = {};
  const [state, formAction, pending] = useActionState(
    mode === "new" ? createTranslatorAction : updateTranslatorAction,
    initialActionState,
  );

  const heading = mode === "new" ? t("newHeading") : t("editHeading");
  const description = mode === "new" ? t("newDescription") : t("editDescription");

  async function doDisable() {
    const fd = new FormData();
    fd.set("id", id);
    await disableTranslatorAction(fd);
    setConfirmDisableOpen(false);
    window.location.reload();
  }

  async function doDelete() {
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteTranslatorAction(fd);
    setConfirmDeleteOpen(false);
    if (res.ok) {
      window.location.assign(`/${locale}/translators`);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/translators`} className={cn(buttonVariants({variant: "outline"}))}>
            {t("backToList")}
          </Link>
          <Link href={`/${locale}/dashboard`} className={cn(buttonVariants({variant: "outline"}))}>
            {t("backToDashboard")}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>{t("profileTitle")}</CardTitle>
          <CardDescription>{t("profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {state.errorKey ? (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(`errors.${state.errorKey}`)}
              {state.errorKey === "database" && (state.errorCode || state.errorMessage) ? (
                <span className="mt-1 block break-all text-xs text-destructive/90">
                  {state.errorCode ? `${state.errorCode}: ` : ""}
                  {state.errorMessage ?? ""}
                </span>
              ) : null}
            </p>
          ) : null}
          {state.ok ? (
            <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              {t("saved")}
            </p>
          ) : null}

          <form id="translator-form" action={formAction} className="flex flex-col gap-6">
            <input type="hidden" name="locale" value={locale} />
            {mode === "edit" ? <input type="hidden" name="id" value={id} /> : null}
            <input type="hidden" name="service_tags" value={JSON.stringify(serviceTags)} readOnly />

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="translator_id">
                  {t("translatorId")}
                </Label>
                <Input
                  id="translator_id"
                  name="translator_id"
                  value={mode === "new" ? "" : translatorIdValue}
                  placeholder={mode === "new" ? "UUID（系統自動產生）" : ""}
                  readOnly
                  disabled={mode === "new"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="created_at_preview">{t("registeredAt")}</Label>
                <Input
                  id="created_at_preview"
                  value={mode === "edit" ? valueOf(initial, "created_at") : t("registeredAtAuto")}
                  disabled
                  readOnly
                />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t("realName")} <span className="text-destructive">*</span>
                </Label>
                <Input id="name" name="name" required defaultValue={valueOf(initial, "name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_name">{t("nickname")}</Label>
                <Input id="line_name" name="line_name" defaultValue={valueOf(initial, "line_name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  {t("email")} <span className="text-destructive">*</span>
                </Label>
                <Input id="email" name="email" type="email" required defaultValue={valueOf(initial, "email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="id_number">
                  {t("idNumber")} <span className="text-destructive">*</span>
                </Label>
                <Input id="id_number" name="id_number" required defaultValue={valueOf(initial, "id_number")} />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone_office">{t("phoneOffice")}</Label>
                <Input id="phone_office" name="phone_office" defaultValue={valueOf(initial, "phone_office")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_mobile">{t("phoneMobile")}</Label>
                <Input id="phone_mobile" name="phone_mobile" defaultValue={valueOf(initial, "phone_mobile")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationality">
                  {t("nationality")} <span className="text-destructive">*</span>
                </Label>
                <select
                  id="nationality"
                  name="nationality"
                  required
                  defaultValue={nationalityInitial}
                  className={selectFieldClass}
                >
                  <option value="" disabled>
                    {t("nationalityPlaceholder")}
                  </option>
                  {nationalityOptions.map((code) => (
                    <option key={code} value={code}>
                      {(CUSTOMER_COUNTRY_CODES as readonly string[]).includes(code) ? tCountries(code) : code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">{t("gender")}</Label>
                <select id="gender" name="gender" defaultValue={valueOf(initial, "gender")} className={selectFieldClass}>
                  <option value="">{t("genderUnset")}</option>
                  <option value="male">{t("genderMale")}</option>
                  <option value="female">{t("genderFemale")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">{t("birthDate")}</Label>
                <Input
                  id="birth_date"
                  name="birth_date"
                  placeholder="YYYY/MM/DD"
                  defaultValue={dateToYmdSlashes(initial?.birth_date)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marital_status">{t("maritalStatus")}</Label>
                <select
                  id="marital_status"
                  name="marital_status"
                  defaultValue={valueOf(initial, "marital_status")}
                  className={selectFieldClass}
                >
                  <option value="">{t("maritalUnset")}</option>
                  <option value="single">{t("maritalSingle")}</option>
                  <option value="married">{t("maritalMarried")}</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emergency_phone">{t("emergencyPhone")}</Label>
                <Input id="emergency_phone" name="emergency_phone" defaultValue={valueOf(initial, "emergency_phone")} />
              </div>
            </section>

            <section className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="household_address">{t("householdAddress")}</Label>
                <Input id="household_address" name="household_address" defaultValue={valueOf(initial, "household_address")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailing_address">{t("mailingAddress")}</Label>
                <Input id="mailing_address" name="mailing_address" defaultValue={valueOf(initial, "mailing_address")} />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="education_school_name">{t("educationSchool")}</Label>
                <Input
                  id="education_school_name"
                  name="education_school_name"
                  defaultValue={valueOf(initial, "education_school_name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="education_degree">{t("educationDegree")}</Label>
                <Input id="education_degree" name="education_degree" defaultValue={valueOf(initial, "education_degree")} />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="education_major">{t("educationMajor")}</Label>
                <Input id="education_major" name="education_major" defaultValue={valueOf(initial, "education_major")} />
              </div>
            </section>

            <section className="grid gap-4">
              <div className="space-y-2">
                <Label>{t("serviceTags")}</Label>
                <p className="text-xs text-muted-foreground">{t("serviceTagsHint")}</p>
                <div className="flex flex-wrap gap-2 rounded-lg border border-input bg-transparent p-3 text-sm dark:bg-input/30">
                  {SERVICE_TAG_ROWS.map(({code, labelKey}) => {
                    const active = serviceTags.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs transition-colors",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => {
                          setServiceTags((prev) => {
                            const next = prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code];
                            return next.length === 0 ? ["TR-EN-ZH"] : next;
                          });
                        }}
                      >
                        {t(labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank_name">{t("bankName")}</Label>
                <Input id="bank_name" name="bank_name" defaultValue={valueOf(initial, "bank_name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_name">{t("bankAccountName")}</Label>
                <Input id="bank_account_name" name="bank_account_name" defaultValue={valueOf(initial, "bank_account_name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_code">
                  {t("bankCode")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bank_code"
                  name="bank_code"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{3}"
                  maxLength={3}
                  placeholder="812"
                  defaultValue={valueOf(initial, "bank_code")}
                />
                <p className="text-xs text-muted-foreground">{t("bankCodeHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_branch">{t("bankBranch")}</Label>
                <Input id="bank_branch" name="bank_branch" defaultValue={valueOf(initial, "bank_branch")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bank_account">
                  {t("bankAccount")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bank_account"
                  name="bank_account"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{9,30}"
                  minLength={9}
                  maxLength={30}
                  placeholder="012345678901"
                  defaultValue={valueOf(initial, "bank_account")}
                />
                <p className="text-xs text-muted-foreground">{t("bankAccountHint")}</p>
              </div>
            </section>
          </form>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40">
          {mode === "edit" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setConfirmDisableOpen(true)} disabled={pending}>
                {t("disable")}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={pending}>
                {t("delete")}
              </Button>
            </>
          ) : null}
          <Button type="submit" form="translator-form" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogHeader>
          <DialogTitle>{t("confirmDisableTitle")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 text-sm text-muted-foreground">{t("confirmDisableBody")}</div>
        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => setConfirmDisableOpen(false)}>
            {t("no")}
          </Button>
          <Button onClick={() => void doDisable()}>{t("yes")}</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogHeader>
          <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 text-sm text-muted-foreground">{t("confirmDeleteBody")}</div>
        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
            {t("no")}
          </Button>
          <Button variant="destructive" onClick={() => void doDelete()}>
            {t("yesDelete")}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

