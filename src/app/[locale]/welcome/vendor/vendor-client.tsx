"use client";

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";

import {registerAsPlatformVendor} from "@/app/[locale]/welcome/actions";
import {Button} from "@/components/ui/button";
import {Link} from "@/i18n/navigation";

export function VendorClient({locale, isPlatformVendor}: {locale: string; isPlatformVendor: boolean}) {
  const router = useRouter();
  const t = useTranslations("Welcome");
  const [message, setMessage] = useState<string | null>(isPlatformVendor ? t("vendorRegistered") : null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <Link href="/welcome" locale={locale} className="text-sm font-medium text-primary hover:underline">
        {t("backToWelcome")}
      </Link>
      <div className="mt-6">
        <h1 className="text-2xl font-semibold text-zinc-900">{t("vendorPageTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("vendorDescription")}</p>
      </div>

      <Button
        type="button"
        className="mt-6 w-full"
        disabled={pending || isPlatformVendor}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            const res = await registerAsPlatformVendor(locale);
            if (!res.ok) {
              setMessage(t("errorGeneric"));
              return;
            }
            router.push(`/${locale}/welcome`);
          });
        }}
      >
        {pending ? t("saving") : t("vendorChoiceCta")}
      </Button>

      {message ? (
        <p className="mt-4 text-sm text-zinc-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
