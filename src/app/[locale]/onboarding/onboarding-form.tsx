"use client";

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";

import {submitDomainOnboarding, submitManualReviewRequest} from "./actions";

function withDevVerifyUrl(href: string, devVerifyUrl?: string) {
  if (!devVerifyUrl) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}devVerifyUrl=${encodeURIComponent(devVerifyUrl)}`;
}

export function OnboardingForm({locale, successRedirectHref}: {locale: string; successRedirectHref?: string}) {
  const router = useRouter();
  const t = useTranslations("Onboarding");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      <form
        className="space-y-4"
        action={(formData) => {
          startTransition(async () => {
            setMessage(null);
            setDevLink(null);
            formData.set("locale", locale);
            const result = await submitDomainOnboarding(formData);
            if (!result.ok) {
              if (result.code === "consumer_email") setMessage(t("errorConsumerEmail"));
              else if (result.code === "missing_fields") setMessage(t("errorMissing"));
              else if (result.code === "not_authenticated") setMessage(t("errorAuth"));
              else if (result.code === "email_failed") setMessage(t("errorEmailFailed"));
              else setMessage(t("errorGeneric"));
              return;
            }
            if (result.devVerifyUrl) {
              setMessage(t("devEmailFallback"));
              setDevLink(result.devVerifyUrl);
              if (successRedirectHref) {
                router.push(withDevVerifyUrl(successRedirectHref, result.devVerifyUrl));
              }
              return;
            }
            setMessage(t("verificationSent"));
            if (successRedirectHref) {
              router.push(successRedirectHref);
            }
          });
        }}
      >
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="full_name">
            {t("fullName")}
          </label>
          <input
            id="full_name"
            name="full_name"
            required
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="organization_name">
            {t("organizationName")}
          </label>
          <input
            id="organization_name"
            name="organization_name"
            required
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="work_email">
            {t("workEmail")}
          </label>
          <input
            id="work_email"
            name="work_email"
            type="email"
            required
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
          />
          <p className="text-xs text-zinc-400">{t("workEmailHint")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">{t("workspaceRoleLegend")}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="workspace_role" value="owner" defaultChecked className="size-4" />
              {t("workspaceRoleOwner")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="workspace_role" value="manager" className="size-4" />
              {t("workspaceRoleManager")}
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? t("submitting") : t("submitVerification")}
        </button>
      </form>

      <div className="border-t border-zinc-100 pt-6">
        <p className="text-sm font-medium text-zinc-800">{t("noDomainTitle")}</p>
        <p className="mt-1 text-sm text-zinc-500">{t("noDomainDescription")}</p>

        <form
          className="mt-4 space-y-3"
          action={(formData) => {
            startTransition(async () => {
              setMessage(null);
              setDevLink(null);
              formData.set("locale", locale);
              const result = await submitManualReviewRequest(formData);
              if (!result.ok) {
                if (result.code === "missing_fields") setMessage(t("errorMissing"));
                else if (result.code === "not_authenticated") setMessage(t("errorAuth"));
                else setMessage(t("errorGeneric"));
                return;
              }
              setMessage(t("manualReviewSubmitted"));
              if (successRedirectHref) {
                router.push(successRedirectHref);
              }
            });
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <input
            name="full_name"
            required
            placeholder={t("fullName")}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
          />
          <textarea
            name="notes"
            rows={3}
            placeholder={t("manualReviewNotesPlaceholder")}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500 focus:ring-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {t("noDomainCta")}
          </button>
        </form>
      </div>

      {message ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <p>{message}</p>
          {devLink ? (
            <p className="mt-2 break-all text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">{t("devLinkLabel")}</span> {devLink}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
