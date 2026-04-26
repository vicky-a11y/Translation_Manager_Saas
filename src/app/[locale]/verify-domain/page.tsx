import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {createClient} from "@/lib/supabase/server";
import {Link} from "@/i18n/navigation";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function VerifyDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{token?: string}>;
}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  const {token} = await searchParams;
  const t = await getTranslations({locale, namespace: "VerifyDomain"});

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50">
        <PublicLocaleHeader locale={locale} />
        <div className="mx-auto flex max-w-md flex-1 flex-col justify-center space-y-3 px-4 py-16 text-center">
          <p className="text-sm text-zinc-600">{t("missingToken")}</p>
          <Link href="/welcome" locale={locale} className="text-sm font-medium text-primary hover:underline">
            {t("backToWelcome")}
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    const nextPath = `/${locale}/verify-domain?token=${encodeURIComponent(token)}`;
    redirect(`/${locale}/login?next=${encodeURIComponent(nextPath)}`);
  }

  const {error} = await supabase.rpc("complete_domain_verification", {p_token: token});

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50">
        <PublicLocaleHeader locale={locale} />
        <div className="mx-auto flex max-w-md flex-1 flex-col justify-center space-y-3 px-4 py-16 text-center">
          <p className="text-sm text-red-600">{t("failed")}</p>
          <p className="text-xs text-zinc-500">{error.message}</p>
          <Link href="/welcome" locale={locale} className="text-sm font-medium text-primary hover:underline">
            {t("backToWelcome")}
          </Link>
        </div>
      </div>
    );
  }

  await supabase
    .from("domain_verifications")
    .update({status: "cancelled"})
    .eq("user_id", user.id)
    .eq("status", "pending");

  redirect(`/${locale}/dashboard`);
}
