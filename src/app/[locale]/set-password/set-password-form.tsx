"use client";

import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";

import {markPasswordSet} from "@/app/[locale]/(app)/account/actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {createClient} from "@/lib/supabase/client";
import type {AppLocale} from "@/i18n/routing";

export function SetPasswordForm({locale}: {locale: AppLocale}) {
  const t = useTranslations("SetPassword");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mx-auto w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const p1 = (form.elements.namedItem("password") as HTMLInputElement).value;
        const p2 = (form.elements.namedItem("password2") as HTMLInputElement).value;
        if (!p1 || p1.length < 8) {
          setMessage(t("errorTooShort"));
          return;
        }
        if (p1 !== p2) {
          setMessage(t("errorMismatch"));
          return;
        }
        startTransition(async () => {
          setMessage(null);
          const supabase = createClient();
          const {error} = await supabase.auth.updateUser({password: p1});
          if (error) {
            setMessage(error.message || t("errorGeneric"));
            return;
          }
          const marked = await markPasswordSet(locale);
          if (!marked.ok) {
            const detail = "message" in marked && marked.message ? `${t("errorFlag")}（${marked.message}）` : t("errorFlag");
            setMessage(detail);
            return;
          }
          // 密碼設定完成後登出並跳回 /login，強制以新密碼再驗證一次（確認使用者確實記得新密碼）
          await supabase.auth.signOut({scope: "local"});
          window.location.assign(`/${locale}/login?passwordUpdated=1`);
        });
      }}
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password2">{t("confirmPassword")}</Label>
        <Input id="password2" name="password2" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? t("saving") : t("submit")}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
