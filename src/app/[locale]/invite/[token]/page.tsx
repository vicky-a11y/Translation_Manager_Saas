import {notFound} from "next/navigation";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {InviteAuthPanel} from "./invite-auth-panel";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{locale: string; token: string}>;
}) {
  const {locale: localeParam, token} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = createAnonPublicClient();
  const {data: active, error} = await supabase.rpc("invitation_token_active", {p_token: token});

  if (error || !active) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <InviteAuthPanel token={token} locale={locale} />
      </div>
    </div>
  );
}
