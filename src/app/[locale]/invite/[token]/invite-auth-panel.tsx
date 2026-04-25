"use client";

import {type FormEvent, useState} from "react";
import {useTranslations} from "next-intl";

import {LoginForm} from "@/app/[locale]/login/login-form";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";

export function InviteAuthPanel({token, locale}: {token: string; locale: string}) {
  const t = useTranslations("Invite");
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const supabase = createAnonPublicClient();
    const {data, error: rpcError} = await supabase.rpc("invitation_email_matches", {
      p_token: token,
      p_email: email.trim(),
    });
    setChecking(false);
    if (rpcError || !data) {
      setError(t("emailMismatch"));
      return;
    }
    setVerifiedEmail(email.trim());
  }

  if (!verifiedEmail) {
    return (
      <form className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" onSubmit={onContinue}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input
            id="invite-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={checking}>
          {checking ? t("checking") : t("continue")}
        </Button>
      </form>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <p className="text-center text-sm text-zinc-600">{t("completeSignIn", {email: verifiedEmail})}</p>
      <LoginForm locale={locale} inviteToken={token} lockedEmail={verifiedEmail} />
    </div>
  );
}
