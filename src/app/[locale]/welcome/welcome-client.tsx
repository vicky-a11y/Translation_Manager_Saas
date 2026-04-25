"use client";

import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";

import {updateWelcomeProfile} from "@/app/[locale]/welcome/actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Link} from "@/i18n/navigation";

type Props = {
  locale: string;
  canAccessApp: boolean;
  initialFullName: string;
  initialLanguage: string;
};

export function WelcomeClient({
  locale,
  canAccessApp,
  initialFullName,
  initialLanguage,
}: Props) {
  const t = useTranslations("Welcome");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("subtitle")}</p>
      </div>

      {canAccessApp ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 text-sm text-emerald-900">
          <p className="font-medium">{t("readyForWorkspace")}</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90"
          >
            {t("enterWorkspace")}
          </Link>
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">{t("profileHeading")}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t("profileHint")}</p>
        <form
          className="mt-4 space-y-4"
          action={(formData) => {
            startTransition(async () => {
              setMessage(null);
              formData.set("locale", locale);
              const res = await updateWelcomeProfile(formData);
              setMessage(res.ok ? t("profileSaved") : t("errorGeneric"));
            });
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-2">
            <Label htmlFor="welcome_full_name">{t("fullName")}</Label>
            <Input id="welcome_full_name" name="full_name" required defaultValue={initialFullName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="welcome_lang">{t("language")}</Label>
            <select
              id="welcome_lang"
              name="language_preference"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initialLanguage}
            >
              <option value="zh-TW">zh-TW</option>
              <option value="zh-CN">zh-CN</option>
              <option value="en">en</option>
              <option value="ms">ms</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("saveProfile")}
          </Button>
        </form>
      </section>

      {!canAccessApp ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t("identityHeading")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("identityHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/welcome/create-company"
              locale={locale}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-zinc-900">{t("createTenantHeading")}</h3>
              <p className="mt-2 text-sm text-zinc-500">{t("createTenantHint")}</p>
              <span className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                {t("createCompanyCta")}
              </span>
            </Link>

            <Link
              href="/welcome/vendor"
              locale={locale}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-zinc-900">{t("vendorHeading")}</h3>
              <p className="mt-2 text-sm text-zinc-500">{t("vendorDescription")}</p>
              <span className="mt-5 inline-flex h-10 items-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground">
                {t("vendorChoiceCta")}
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      {message ? (
        <p className="text-sm text-zinc-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
