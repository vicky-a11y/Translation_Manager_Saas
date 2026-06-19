"use client";

import {useTranslations} from "next-intl";

import {Link} from "@/i18n/navigation";

type Props = {
  locale: string;
};

export function WelcomeClient({locale}: Props) {
  const t = useTranslations("Welcome");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("subtitle")}</p>
        <p className="mt-4 text-sm text-zinc-500">{t("identityHint")}</p>
      </div>

      <Link
        href="/welcome/create-company"
        locale={locale}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 sm:w-auto"
      >
        {t("createCompanyCta")}
      </Link>
    </div>
  );
}
