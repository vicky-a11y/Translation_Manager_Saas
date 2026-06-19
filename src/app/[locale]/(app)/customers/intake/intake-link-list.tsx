"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";

import {revokeIntakeLink} from "@/app/[locale]/actions/customer-intake";
import {Button} from "@/components/ui/button";
import type {AppLocale} from "@/i18n/routing";

export type IntakeLinkItem = {
  id: string;
  token: string;
  label: string | null;
  is_active: boolean;
};

export function IntakeLinkList({locale, links}: {locale: AppLocale; links: IntakeLinkItem[]}) {
  const t = useTranslations("CustomerIntakeAdmin");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function pathFor(token: string) {
    return `/${locale}/intake/${token}`;
  }

  function fullUrl(token: string) {
    if (typeof window === "undefined") return pathFor(token);
    return `${window.location.origin}${pathFor(token)}`;
  }

  async function copy(item: IntakeLinkItem) {
    try {
      await navigator.clipboard.writeText(fullUrl(item.token));
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 2000);
    } catch {
      // 忽略複製失敗（部分瀏覽器需 HTTPS 或權限）
    }
  }

  if (links.length === 0) {
    return <p className="py-3 text-sm text-zinc-500">{t("noLinks")}</p>;
  }

  return (
    <ul className="mt-2 divide-y divide-zinc-100">
      {links.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0">
            {item.label ? <span className="font-medium text-zinc-900">{item.label}</span> : null}
            <p className="mt-1 break-all text-xs text-zinc-500">
              {t("linkUrlLabel")}
              <span className="text-blue-600">{pathFor(item.token)}</span>
            </p>
            <span
              className={
                item.is_active
                  ? "mt-1 inline-block text-xs text-emerald-600"
                  : "mt-1 inline-block text-xs text-zinc-400"
              }
            >
              {item.is_active ? t("active") : t("inactive")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => copy(item)} disabled={!item.is_active}>
              {copiedId === item.id ? t("copied") : t("copy")}
            </Button>
            {item.is_active ? (
              <form action={revokeIntakeLink}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="link_id" value={item.id} />
                <Button type="submit" variant="ghost" size="sm">
                  {t("revoke")}
                </Button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
