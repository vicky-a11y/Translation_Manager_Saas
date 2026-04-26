import type {AppLocale} from "@/i18n/routing";
import {Link} from "@/i18n/navigation";

import {LanguageSwitcher} from "./language-switcher";

export function PublicLocaleHeader({
  locale,
  showLogout = false,
  logoutLabel = "登出",
}: {
  locale: AppLocale;
  showLogout?: boolean;
  logoutLabel?: string;
}) {
  return (
    <header className="flex shrink-0 items-center justify-end gap-3 border-b border-border bg-background px-4 py-3">
      {showLogout ? (
        <Link href="/logout" locale={locale} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          {logoutLabel}
        </Link>
      ) : null}
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
