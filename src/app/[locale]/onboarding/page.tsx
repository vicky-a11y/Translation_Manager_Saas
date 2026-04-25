import {redirect} from "next/navigation";

import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

/** 舊路徑相容：流程已併入 `/welcome`。 */
export default async function OnboardingPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  redirect(`/${locale}/welcome`);
}
