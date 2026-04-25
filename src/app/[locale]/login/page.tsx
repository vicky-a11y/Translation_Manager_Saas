import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";
import {getPostLoginHref} from "@/lib/tenant/post-auth";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";

import {LoginForm} from "./login-form";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function getSafeLocalNext(next: string | undefined, locale: AppLocale) {
  if (!next?.startsWith("/") || next.startsWith("//")) return null;
  if (next === `/${locale}` || next.startsWith(`/${locale}/`)) return next;
  return null;
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{next?: string; passwordUpdated?: string; invite?: string}>;
}) {
  const {locale: localeParam} = await params;
  const {next, passwordUpdated, invite} = await searchParams;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  const safeNext = getSafeLocalNext(next, locale);

  // 若帶有 passwordUpdated=1，代表使用者剛完成重設密碼流程並已 signOut；此時任何殘留 session 都略過 redirect，
  // 確保使用者一定能看到「請以新密碼重新登入」的提示。
  if (user && passwordUpdated !== "1") {
    redirect(safeNext ?? (await getPostLoginHref(supabase, locale, user.id, user.email)));
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <LoginForm
          locale={locale}
          next={next}
          inviteToken={invite}
          passwordJustUpdated={passwordUpdated === "1"}
        />
      </div>
    </div>
  );
}
