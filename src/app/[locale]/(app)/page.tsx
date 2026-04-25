import {redirect} from "next/navigation";

import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

/** 租戶內預設入口導向儀表板（實際內容於 /dashboard）。 */
export default async function AppHomeRedirect({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  redirect(`/${locale}/dashboard`);
}
