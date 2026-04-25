import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {OnboardingForm} from "@/app/[locale]/onboarding/onboarding-form";
import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {Link} from "@/i18n/navigation";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";
import {userHasPasswordConfigured} from "@/lib/tenant/post-auth";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function CreateCompanyPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;
  const t = await getTranslations({locale, namespace: "Welcome"});

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
      <main className="flex flex-1 flex-col px-4 py-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Link href="/welcome" locale={locale} className="text-sm font-medium text-primary hover:underline">
            {t("backToWelcome")}
          </Link>
          <OnboardingForm locale={locale} successRedirectHref={`/${locale}/welcome/check-email`} />
        </div>
      </main>
    </div>
  );
}
