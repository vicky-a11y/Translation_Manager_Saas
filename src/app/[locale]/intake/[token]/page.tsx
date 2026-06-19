import {getTranslations} from "next-intl/server";

import {IntakeForm} from "./intake-form";
import {loadIntakePreview} from "@/lib/customer-intake/load-intake-preview";
import {type AppLocale, defaultLocale, locales} from "@/i18n/routing";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export default async function CustomerIntakePage({
  params,
}: {
  params: Promise<{locale: string; token: string}>;
}) {
  const {locale: localeParam, token} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const preview = await loadIntakePreview(token);
  const t = await getTranslations({locale, namespace: "CustomerIntakePublic"});

  if (!preview.valid) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">{t("invalidTitle")}</h1>
        <p className="text-sm text-zinc-500">{t("invalidDescription")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <IntakeForm locale={locale} token={token} tenantName={preview.tenantName ?? ""} />
    </main>
  );
}
