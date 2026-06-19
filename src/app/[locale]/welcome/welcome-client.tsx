"use client";

import {useTranslations} from "next-intl";

import {AccountClient, type AccountClientProps} from "@/app/[locale]/(app)/account/account-client";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type Props = {
  locale: AppLocale;
  userEmail: string;
  profile: AccountClientProps["initial"];
};

/** 未加入租戶前的平台大廳：個人資料為主，建立公司為可選。 */
export function WelcomeClient({locale, userEmail, profile}: Props) {
  const t = useTranslations("Welcome");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("subtitle")}</p>
        <p className="mt-3 text-sm text-zinc-500">{t("lobbyHint")}</p>
      </div>

      <AccountClient locale={locale} userEmail={userEmail} initial={profile} />

      <section className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-6">
        <h2 className="text-base font-semibold text-zinc-900">{t("optionalNextHeading")}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t("optionalNextHint")}</p>
        <Link
          href="/welcome/create-company"
          locale={locale}
          className="mt-4 inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {t("createCompanyCta")}
        </Link>
      </section>
    </div>
  );
}
