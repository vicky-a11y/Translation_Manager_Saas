import {redirect} from "next/navigation";

import {PendingInvitationModal} from "@/components/invitations/pending-invitation-modal";
import {PublicLocaleHeader} from "@/components/layout/public-locale-header";
import {createClient} from "@/lib/supabase/server";
import {canAccessTenantAppShell, userHasPasswordConfigured} from "@/lib/tenant/post-auth";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

import {WelcomeClient} from "./welcome-client";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function WelcomePage({params}: {params: Promise<{locale: string}>}) {
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

  const canApp = await canAccessTenantAppShell(supabase, user.id, user.email);

  if (canApp) {
    redirect(`/${locale}/dashboard`);
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("full_name, language_preference")
    .eq("id", user.id)
    .maybeSingle();

  const {data: invitationRows} = await supabase.from("invitations").select("token, tenants(name)");

  const pendingInvites = (invitationRows ?? []).map((row) => {
    const tenants = row.tenants as unknown;
    let companyName = "Organization";
    if (Array.isArray(tenants)) {
      const first = tenants[0] as {name?: string | null} | undefined;
      companyName = first?.name?.trim() || companyName;
    } else if (tenants && typeof tenants === "object" && "name" in tenants) {
      companyName = String((tenants as {name?: string | null}).name ?? "").trim() || companyName;
    }
    return {token: row.token as string, companyName};
  });

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-50">
      <PublicLocaleHeader locale={locale} />
      <div className="relative flex flex-1 flex-col px-4 py-10">
        <PendingInvitationModal locale={locale} invites={pendingInvites} />
        <WelcomeClient
          locale={locale}
          canAccessApp={canApp}
          initialFullName={profile?.full_name ?? ""}
          initialLanguage={profile?.language_preference ?? "zh-TW"}
        />
      </div>
    </div>
  );
}
