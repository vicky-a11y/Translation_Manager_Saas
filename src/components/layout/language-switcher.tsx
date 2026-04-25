"use client";

import {useTranslations} from "next-intl";

import {Link, usePathname} from "@/i18n/navigation";
import {locales, type AppLocale} from "@/i18n/routing";

const localeLabels: Record<AppLocale, string> = {
  "zh-TW": "繁中",
  "zh-CN": "简中",
  en: "EN",
  ms: "BM",
};

export function LanguageSwitcher({currentLocale}: {currentLocale: AppLocale}) {
  const pathname = usePathname();
  const navT = useTranslations("Navigation");

  return (
    <div
      role="navigation"
      aria-label={navT("language")}
      className="flex max-w-[min(100%,14rem)] flex-wrap items-center justify-end gap-1 rounded-md border border-border bg-card p-1 text-sm shadow-sm"
    >
      {locales.map((locale) => {
        const isActive = locale === currentLocale;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            className={`shrink-0 rounded px-2 py-1 transition ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {localeLabels[locale]}
          </Link>
        );
      })}
    </div>
  );
}
