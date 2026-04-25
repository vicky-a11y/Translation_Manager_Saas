import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {Link} from "@/i18n/navigation";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";
import {userHasPasswordConfigured} from "@/lib/tenant/post-auth";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function CheckEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{devVerifyUrl?: string}>;
}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  const {devVerifyUrl} = await searchParams;
  const t = await getTranslations({locale, namespace: "Onboarding"});

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (!(await userHasPasswordConfigured(supabase, user.id, user.email))) {
    redirect(`/${locale}/set-password`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-xl font-semibold text-blue-700">
            @
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-zinc-900">{t("checkEmailTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{t("checkEmailDescription")}</p>
          <p className="mt-4 text-xs leading-5 text-zinc-500">{t("checkEmailHint")}</p>

          {devVerifyUrl ? (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
              <p className="font-medium">{t("devLinkLabel")}</p>
              <p className="mt-1 break-all">{devVerifyUrl}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/welcome"
              locale={locale}
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              {t("backToWelcome")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
