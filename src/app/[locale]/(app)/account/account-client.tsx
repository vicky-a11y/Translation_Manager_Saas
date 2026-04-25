"use client";

import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";
import {useTranslations} from "next-intl";

import {markPasswordSet, saveAccountProfile} from "@/app/[locale]/(app)/account/actions";
import {ACCOUNT_TIMEZONE_OPTIONS} from "@/app/[locale]/(app)/account/timezones";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {createClient} from "@/lib/supabase/client";
import type {AppLocale} from "@/i18n/routing";

export type AccountClientProps = {
  locale: AppLocale;
  userEmail: string;
  initial: {
    full_name: string | null;
    nickname: string | null;
    gender: string | null;
    phone: string | null;
    address: string | null;
    region: string | null;
    timezone: string | null;
    language_preference: string;
    real_name: string | null;
    password_set_at: string | null;
  };
};

function normEmail(s: string) {
  return s.trim().toLowerCase();
}

export function AccountClient({locale, userEmail, initial}: AccountClientProps) {
  const t = useTranslations("AccountPage");
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [secMessage, setSecMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [secPending, startSecTransition] = useTransition();

  const [hasPasswordRecord, setHasPasswordRecord] = useState(Boolean(initial.password_set_at));

  async function onSaveProfile(formData: FormData) {
    startTransition(async () => {
      setMessage(null);
      formData.set("locale", locale);
      const res = await saveAccountProfile(formData);
      setMessage(res.ok ? t("profileSaved") : t("errorProfile"));
      if (res.ok) router.refresh();
    });
  }

  async function onChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSecMessage(null);
    const form = e.currentTarget;
    const verifyEmail = (form.elements.namedItem("pwd_verify_email") as HTMLInputElement).value;
    const oldPwd = (form.elements.namedItem("pwd_old") as HTMLInputElement).value;
    const newPwd = (form.elements.namedItem("pwd_new") as HTMLInputElement).value;
    const newPwd2 = (form.elements.namedItem("pwd_new2") as HTMLInputElement).value;

    if (normEmail(verifyEmail) !== normEmail(userEmail)) {
      setSecMessage(t("errorEmailMismatch"));
      return;
    }
    if (!newPwd) {
      setSecMessage(t("errorNewPasswordRequired"));
      return;
    }
    if (newPwd !== newPwd2) {
      setSecMessage(t("errorPasswordConfirm"));
      return;
    }
    if (!oldPwd) {
      setSecMessage(t("errorOldPasswordRequired"));
      return;
    }

    startSecTransition(async () => {
      const supabase = createClient();
      const {error: signErr} = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPwd,
      });
      if (signErr) {
        setSecMessage(t("errorOldPasswordWrong"));
        return;
      }
      const {error: updErr} = await supabase.auth.updateUser({password: newPwd});
      if (updErr) {
        setSecMessage(updErr.message || t("errorPasswordUpdate"));
        return;
      }
      const marked = await markPasswordSet(locale);
      if (!marked.ok) {
        setSecMessage(t("errorPasswordFlag"));
        return;
      }
      setHasPasswordRecord(true);
      form.reset();
      setSecMessage(t("passwordUpdated"));
      router.refresh();
    });
  }

  async function onChangeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSecMessage(null);
    const form = e.currentTarget;
    const verifyEmail = (form.elements.namedItem("em_verify_email") as HTMLInputElement).value;
    const pwd = (form.elements.namedItem("em_password") as HTMLInputElement).value;
    const newEmail = (form.elements.namedItem("em_new") as HTMLInputElement).value.trim();

    if (normEmail(verifyEmail) !== normEmail(userEmail)) {
      setSecMessage(t("errorEmailMismatch"));
      return;
    }
    if (!pwd) {
      setSecMessage(t("errorPasswordForEmail"));
      return;
    }
    if (!newEmail || normEmail(newEmail) === normEmail(userEmail)) {
      setSecMessage(t("errorNewEmailInvalid"));
      return;
    }

    startSecTransition(async () => {
      const supabase = createClient();
      const {error: signErr} = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: pwd,
      });
      if (signErr) {
        setSecMessage(t("errorPasswordForEmailWrong"));
        return;
      }
      const {error: emErr} = await supabase.auth.updateUser({email: newEmail});
      if (emErr) {
        setSecMessage(emErr.message || t("errorEmailUpdate"));
        return;
      }
      setSecMessage(t("emailChangePending"));
      form.reset();
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("sectionProfile")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("realNameHint")}</p>
        <form className="mt-6 space-y-4" action={(fd) => void onSaveProfile(fd)}>
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-2">
            <Label htmlFor="real_name">{t("realName")}</Label>
            <Input id="real_name" name="real_name" defaultValue={initial.real_name ?? ""} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nickname">{t("nickname")}</Label>
            <Input id="nickname" name="nickname" defaultValue={initial.nickname ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("displayName")}</Label>
            <Input id="full_name" name="full_name" defaultValue={initial.full_name ?? ""} />
            <p className="text-xs text-muted-foreground">{t("displayNameHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">{t("gender")}</Label>
            <select
              id="gender"
              name="gender"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initial.gender ?? ""}
            >
              <option value="">{t("genderUnset")}</option>
              <option value="male">{t("genderMale")}</option>
              <option value="female">{t("genderFemale")}</option>
              <option value="undisclosed">{t("genderUndisclosed")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ""} autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{t("address")}</Label>
            <Input id="address" name="address" defaultValue={initial.address ?? ""} autoComplete="street-address" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">{t("region")}</Label>
            <Input id="region" name="region" defaultValue={initial.region ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t("timezone")}</Label>
            <select
              id="timezone"
              name="timezone"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initial.timezone ?? ""}
            >
              <option value="">{t("timezoneUnset")}</option>
              {ACCOUNT_TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language_preference">{t("language")}</Label>
            <select
              id="language_preference"
              name="language_preference"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initial.language_preference}
            >
              <option value="zh-TW">{t("langZhTW")}</option>
              <option value="zh-CN">{t("langZhCN")}</option>
              <option value="en">{t("langEn")}</option>
              <option value="ms">{t("langMs")}</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("saveProfile")}
          </Button>
        </form>
        {message ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("sectionAccount")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("emailReadonlyHint")}</p>

        <div className="mt-4 space-y-2">
          <Label>{t("email")}</Label>
          <Input readOnly value={userEmail} className="bg-muted" />
        </div>

        <div className="mt-6 space-y-2">
          <Label>{t("passwordDisplay")}</Label>
          <Input
            readOnly
            type="text"
            className="bg-muted font-mono tracking-widest"
            value={hasPasswordRecord ? "••••••••" : t("passwordNotSet")}
            aria-label={t("passwordDisplay")}
          />
          <p className="text-xs text-muted-foreground">{t("passwordDisplayHint")}</p>
        </div>

        <form className="mt-8 space-y-4 border-t border-border pt-8" onSubmit={onChangePassword}>
          <h3 className="text-base font-semibold">{t("changePassword")}</h3>
          <p className="text-sm text-muted-foreground">{t("changePasswordHint")}</p>
          <div className="space-y-2">
            <Label htmlFor="pwd_verify_email">{t("verifyEmailLabel")}</Label>
            <Input id="pwd_verify_email" name="pwd_verify_email" type="email" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd_old">{t("oldPassword")}</Label>
            <Input id="pwd_old" name="pwd_old" type="password" autoComplete="current-password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd_new">{t("newPassword")}</Label>
            <Input id="pwd_new" name="pwd_new" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd_new2">{t("newPasswordConfirm")}</Label>
            <Input id="pwd_new2" name="pwd_new2" type="password" autoComplete="new-password" />
          </div>
          <Button type="submit" variant="secondary" disabled={secPending}>
            {secPending ? t("applying") : t("applyPassword")}
          </Button>
        </form>

        <form className="mt-10 space-y-4 border-t border-border pt-8" onSubmit={onChangeEmail}>
          <h3 className="text-base font-semibold">{t("changeEmail")}</h3>
          <p className="text-sm text-muted-foreground">{t("changeEmailHint")}</p>
          <div className="space-y-2">
            <Label htmlFor="em_new">{t("newEmail")}</Label>
            <Input id="em_new" name="em_new" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="em_verify_email">{t("verifyEmailLabel")}</Label>
            <Input id="em_verify_email" name="em_verify_email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="em_password">{t("passwordForEmailChange")}</Label>
            <Input id="em_password" name="em_password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" variant="secondary" disabled={secPending}>
            {secPending ? t("applying") : t("applyEmail")}
          </Button>
        </form>

        {secMessage ? (
          <p className="mt-6 text-sm text-muted-foreground" role="status">
            {secMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
