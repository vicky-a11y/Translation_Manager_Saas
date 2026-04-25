import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {createClient} from "@/lib/supabase/server";
import {getPostLoginHref, userHasPasswordConfigured} from "@/lib/tenant/post-auth";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {SetPasswordForm} from "./set-password-form";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function SetPasswordPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (await userHasPasswordConfigured(supabase, user.id, user.email)) {
    redirect(await getPostLoginHref(supabase, locale, user.id, user.email));
  }

  const t = await getTranslations({locale, namespace: "SetPassword"});

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <SetPasswordForm locale={locale} />
        <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">{t("hint")}</p>
      </div>
    </div>
  );
}
