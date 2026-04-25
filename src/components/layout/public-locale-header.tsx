import type {AppLocale} from "@/i18n/routing";

import {LanguageSwitcher} from "./language-switcher";

export function PublicLocaleHeader({locale}: {locale: AppLocale}) {
  return (
    <header className="flex shrink-0 items-center justify-end border-b border-border bg-background px-4 py-3">
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
