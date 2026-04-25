"use client";

import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";

import {acceptInvitation, declineInvitation} from "@/app/[locale]/actions/invitations";

export type PendingInviteRow = {
  token: string;
  companyName: string;
};

export function PendingInvitationModal({locale, invites}: {locale: string; invites: PendingInviteRow[]}) {
  const t = useTranslations("Invitations");
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitation-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg"
      >
        <h2 id="invitation-title" className="text-lg font-semibold text-zinc-900">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-zinc-500">{t("description")}</p>

        <ul className="mt-4 space-y-4">
          {invites.map((inv) => (
            <li key={inv.token} className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <p className="text-sm font-medium text-zinc-900">
                {t("joinPrompt", {company: inv.companyName})}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      setMessage(null);
                      const res = await acceptInvitation(inv.token, locale);
                      if (!res.ok) {
                        setMessage(res.message);
                        return;
                      }
                      router.push(`/${locale}`);
                      router.refresh();
                    });
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {t("accept")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      setMessage(null);
                      const res = await declineInvitation(inv.token, locale);
                      if (!res.ok) {
                        setMessage(res.message);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white disabled:opacity-60"
                >
                  {t("decline")}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}

        <p className="mt-4 text-xs text-zinc-400">{t("footerHint")}</p>
      </div>
    </div>
  );
}
