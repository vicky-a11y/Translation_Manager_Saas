import {redirect} from "next/navigation";

import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

/** 舊版邀請連結相容：導向登入頁並帶 invite token。 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{locale: string; token: string}>;
}) {
  const {locale: localeParam, token} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  redirect(`/${locale}/login?invite=${encodeURIComponent(token)}`);
}
