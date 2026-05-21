import {redirect} from "next/navigation";
import {getTranslations} from "next-intl/server";

import {createClient} from "@/lib/supabase/server";
import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";
import {getPostLoginHref} from "@/lib/tenant/post-auth";
import {Link} from "@/i18n/navigation";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {PublicLocaleHeader} from "@/components/layout/public-locale-header";

import {LoginForm} from "./login-form";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSafeLocalNext(next: string | undefined, locale: AppLocale) {
  if (!next?.startsWith("/") || next.startsWith("//")) return null;
  if (next === `/${locale}` || next.startsWith(`/${locale}/`)) return next;
  return null;
}

type InvitePreview = {
  valid: boolean;
  tenantName?: string;
};

async function loadInvitePreview(token: string): Promise<InvitePreview> {
  if (!isUuid(token)) {
    return {valid: false};
  }

  const supabase = createAnonPublicClient();
  const {data, error} = await supabase.rpc("invitation_public_preview", {p_token: token});
  if (error) {
    const {data: active, error: activeError} = await supabase.rpc("invitation_token_active", {p_token: token});
    return {valid: Boolean(active) && !activeError};
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {valid: false};
  }

  const row = data as {valid?: boolean; tenant_name?: string};
  if (!row.valid) {
    return {valid: false};
  }

  return {valid: true, tenantName: row.tenant_name?.trim() || undefined};
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
  const inviteToken = invite?.trim() || undefined;

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

  const invitePreview = inviteToken ? await loadInvitePreview(inviteToken) : null;
  const inviteT = inviteToken ? await getTranslations({locale, namespace: "Invite"}) : null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        {inviteToken && invitePreview && !invitePreview.valid ? (
          <main className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight">{inviteT!("invalidTitle")}</h1>
            <p className="text-sm text-muted-foreground">{inviteT!("invalidDescription")}</p>
            <Link
              href="/login"
              locale={locale}
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {inviteT!("backToLogin")}
            </Link>
          </main>
        ) : (
          <LoginForm
            locale={locale}
            next={next}
            inviteToken={inviteToken}
            inviteTenantName={invitePreview?.tenantName}
            passwordJustUpdated={passwordUpdated === "1"}
          />
        )}
      </div>
    </div>
  );
}
