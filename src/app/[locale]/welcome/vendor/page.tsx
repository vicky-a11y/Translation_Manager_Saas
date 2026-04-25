import {redirect} from "next/navigation";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";
import {userHasPasswordConfigured} from "@/lib/tenant/post-auth";

import {VendorClient} from "./vendor-client";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function VendorPage({params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

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

  const {data: profile} = await supabase
    .from("profiles")
    .select("is_platform_vendor")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <main className="flex flex-1 flex-col justify-center px-4 py-10">
        <VendorClient locale={locale} isPlatformVendor={Boolean(profile?.is_platform_vendor)} />
      </main>
    </div>
  );
}
