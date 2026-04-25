"use client";

import {REGEXP_ONLY_DIGITS} from "input-otp";
import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";

import {acceptInvitation} from "../actions/invitations";
import {markPasswordSet} from "@/app/[locale]/(app)/account/actions";
import {getPostLoginTargetAction} from "@/app/[locale]/login/actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot} from "@/components/ui/input-otp";
import {Label} from "@/components/ui/label";
import {createClient} from "@/lib/supabase/client";

const RESEND_COOLDOWN_SEC = 60;

type AuthTab = "signin" | "register" | "forgot";
type Step = "main" | "otp" | "newpw";

function getSafeLocalNext(next: string | undefined, locale: string) {
  if (!next?.startsWith("/") || next.startsWith("//")) return null;
  if (next === `/${locale}` || next.startsWith(`/${locale}/`)) return next;
  return null;
}

export function LoginForm({
  locale,
  next,
  inviteToken,
  lockedEmail,
  passwordJustUpdated,
}: {
  locale: string;
  /** 保留供未來導向參數擴充 */
  next?: string;
  inviteToken?: string;
  lockedEmail?: string;
  /** 若為 true，顯示「密碼已更新，請重新登入」的綠色提示橫幅 */
  passwordJustUpdated?: boolean;
}) {
  const t = useTranslations("Auth");
  const appT = useTranslations("App");
  const [email, setEmail] = useState(lockedEmail?.trim() ?? "");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [otp, setOtp] = useState("");
  const otpRef = useRef("");
  const verifyInFlight = useRef(false);
  const lockedResolved = useRef(false);
  const [tab, setTab] = useState<AuthTab>("signin");
  const [step, setStep] = useState<Step>("main");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(lockedEmail?.trim()));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lockedBootstrapping, setLockedBootstrapping] = useState(() => Boolean(lockedEmail?.trim()));

  const requestOtpEmail = useCallback(
    async (options: {resend: boolean; emailOverride?: string; createUser?: boolean}) => {
      const {resend, emailOverride, createUser = true} = options;
      const addr = (emailOverride ?? email).trim();
      if (!addr) return;
      if (resend && resendCooldown > 0) return;

      setLoading(true);
      setMessage(null);
      const supabase = createClient();
      const {error} = await supabase.auth.signInWithOtp({
        email: addr,
        options: {
          shouldCreateUser: createUser,
        },
      });
      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!resend) {
        setStep("otp");
      }
      setOtp("");
      setMessage(resend ? t("resent") : t("otpSent"));
      setResendCooldown(RESEND_COOLDOWN_SEC);
    },
    [email, resendCooldown, t],
  );

  useEffect(() => {
    otpRef.current = otp;
  }, [otp]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    const le = lockedEmail?.trim();
    if (!le || lockedResolved.current) return;
    lockedResolved.current = true;
    setEmail(le);
    void (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const supabase = createClient();
        const {data: mode, error} = await supabase.rpc("auth_login_method", {p_email: le});
        if (error) {
          setMessage(error.message);
          setStep("main");
          return;
        }
        if (mode === "password") {
          setTab("signin");
          setStep("main");
          return;
        }
        setStep("otp");
        await requestOtpEmail({resend: false, emailOverride: le});
      } finally {
        setLoading(false);
        setLockedBootstrapping(false);
      }
    })();
  }, [lockedEmail, requestOtpEmail]);

  async function syncPasswordFlagIfMissing(userId: string) {
    const supabase = createClient();
    const {data: prof} = await supabase.from("profiles").select("password_set_at").eq("id", userId).maybeSingle();
    if (!prof?.password_set_at) {
      await markPasswordSet(locale);
    }
  }

  async function submitPasswordLogin(addr: string) {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {data: authData, error} = await supabase.auth.signInWithPassword({
        email: addr,
        password,
      });
      if (error || !authData.user) {
        setMessage(error?.message ?? t("passwordInvalid"));
        return;
      }
      await syncPasswordFlagIfMissing(authData.user.id);

      if (inviteToken) {
        const join = await acceptInvitation(inviteToken, locale);
        if (!join.ok) {
          setMessage(join.message ?? "invite_failed");
          return;
        }
        window.location.assign(await getPostLoginTargetAction(locale));
        return;
      }

      window.location.assign(getSafeLocalNext(next, locale) ?? (await getPostLoginTargetAction(locale)));
    } finally {
      setLoading(false);
    }
  }

  async function submitSignInMain(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const {data: mode, error} = await supabase.rpc("auth_login_method", {p_email: addr});
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === "password") {
      if (!password) {
        setMessage(t("passwordRequired"));
        return;
      }
      await submitPasswordLogin(addr);
      return;
    }
    await requestOtpEmail({resend: false});
  }

  async function submitRegisterSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const {data: mode, error} = await supabase.rpc("auth_login_method", {p_email: addr});
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === "password") {
      setMessage(t("registerEmailAlreadyHasPassword"));
      return;
    }
    await requestOtpEmail({resend: false});
  }

  async function submitForgotSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const {data: mode, error} = await supabase.rpc("auth_login_method", {p_email: addr});
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }
    if (mode !== "password") {
      // 尚未設定密碼或帳號不存在：不寄送 OTP，避免誤用「忘記密碼」流程去登入新帳號。
      setLoading(false);
      setMessage(t("forgotNoPassword"));
      return;
    }
    setLoading(false);
    // forgot 流程：一律 shouldCreateUser = false，避免忘記密碼時意外建立新帳號。
    await requestOtpEmail({resend: false, createUser: false});
  }

  async function submitForgotNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setMessage(t("forgotTooShort"));
      return;
    }
    if (newPassword !== newPassword2) {
      setMessage(t("forgotMismatch"));
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {data: authData, error} = await supabase.auth.updateUser({password: newPassword});
      if (error || !authData?.user) {
        setMessage(error?.message ?? t("forgotUpdateFailed"));
        return;
      }
      // 若 profiles.password_set_at 已有值會 no-op；為 null 則補上（走 markPasswordSet RPC，繞過 RLS）。
      await syncPasswordFlagIfMissing(authData.user.id);

      // 重設密碼完成後登出 OTP 驗證建立的 session，回到登入頁強制使用者以新密碼重新驗證一次。
      await supabase.auth.signOut({scope: "local"});
      const loginHref = inviteToken
        ? `/${locale}/login?passwordUpdated=1&invite=${encodeURIComponent(inviteToken)}`
        : `/${locale}/login?passwordUpdated=1`;
      window.location.assign(loginHref);
    } finally {
      setLoading(false);
    }
  }

  async function verifyWithToken(token: string) {
    const clean = token.replace(/\D/g, "");
    if (clean.length !== 6 || verifyInFlight.current) return;

    verifyInFlight.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {error} = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: clean,
        type: "email",
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      // 忘記密碼：Supabase 已建立 session，留在本表單切到「設定新密碼」步驟。
      if (tab === "forgot") {
        setStep("newpw");
        setOtp("");
        setNewPassword("");
        setNewPassword2("");
        setMessage(null);
        return;
      }

      if (inviteToken) {
        const join = await acceptInvitation(inviteToken, locale);
        if (!join.ok) {
          setMessage(join.message ?? "invite_failed");
          return;
        }
        window.location.assign(await getPostLoginTargetAction(locale));
        return;
      }

      window.location.assign(getSafeLocalNext(next, locale) ?? (await getPostLoginTargetAction(locale)));
    } finally {
      setLoading(false);
      verifyInFlight.current = false;
    }
  }

  const emailLocked = Boolean(lockedEmail?.trim());
  const showTabSwitch = !emailLocked && tab !== "forgot";

  function switchTab(nextTab: AuthTab) {
    setTab(nextTab);
    setStep("main");
    setPassword("");
    setNewPassword("");
    setNewPassword2("");
    setOtp("");
    setMessage(null);
    setResendCooldown(0);
    if (!emailLocked) {
      setEmail("");
    }
  }

  function startForgotFlow() {
    setTab("forgot");
    setStep("main");
    setPassword("");
    setNewPassword("");
    setNewPassword2("");
    setOtp("");
    setMessage(null);
    setResendCooldown(0);
    // 保留使用者在登入 tab 已輸入的 email，省得重打一次。
  }

  const subtitle =
    step === "newpw"
      ? t("forgotNewPasswordSubtitle", {email})
      : step === "otp"
        ? tab === "forgot"
          ? t("forgotOtpSubtitle", {email})
          : t("otpStepSubtitle", {email})
        : tab === "forgot"
          ? t("forgotEmailSubtitle")
          : tab === "register"
            ? t("registerSubtitle")
            : emailLocked
              ? t("passwordStepSubtitle", {email})
              : t("signInSubtitle");

  const cardHeading =
    step === "newpw"
      ? t("forgotNewPasswordHeading")
      : tab === "forgot"
        ? t("forgotHeading")
        : step === "otp"
          ? t("otpHeading")
          : tab === "register"
            ? t("registerHeading")
            : t("signInHeading");

  return (
    <div className="mx-auto w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
      <div className="space-y-1 text-center sm:text-left">
        <p className="text-sm font-medium text-muted-foreground">{appT("title")}</p>
        <h1 className="text-xl font-semibold tracking-tight">{cardHeading}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {passwordJustUpdated ? (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {t("passwordUpdatedPleaseSignIn")}
        </div>
      ) : null}

      {lockedBootstrapping && loading && step === "main" ? (
        <p className="text-center text-sm text-muted-foreground">{t("checkingLoginMode")}</p>
      ) : null}

      {showTabSwitch && step === "main" ? (
        <div className="flex rounded-lg border border-border p-1 text-sm font-medium">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 transition-colors ${
              tab === "signin" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchTab("signin")}
          >
            {t("signInHeading")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 transition-colors ${
              tab === "register" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchTab("register")}
          >
            {t("registerHeading")}
          </button>
        </div>
      ) : null}

      {step === "main" && !(lockedBootstrapping && loading) && tab === "signin" ? (
        <form className="space-y-4" onSubmit={submitSignInMain}>
          <div className="space-y-2">
            <Label htmlFor="login-account">{t("account")}</Label>
            <Input
              id="login-account"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              disabled={emailLocked}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">{t("password")}</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                onClick={startForgotFlow}
                disabled={loading}
              >
                {t("forgotPasswordLink")}
              </button>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!emailLocked ? (
              <p className="text-xs text-muted-foreground">{t("passwordOptionalHint")}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("checkingLoginMode") : t("submitLogin")}
          </Button>
        </form>
      ) : null}

      {step === "main" && !(lockedBootstrapping && loading) && tab === "register" ? (
        <form className="space-y-4" onSubmit={submitRegisterSendOtp}>
          <div className="space-y-2">
            <Label htmlFor="register-email">{t("email")}</Label>
            <Input
              id="register-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("sending") : t("sendCode")}
          </Button>
        </form>
      ) : null}

      {step === "main" && tab === "forgot" ? (
        <form className="space-y-4" onSubmit={submitForgotSendOtp}>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">{t("email")}</Label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
            <Button type="submit" className="w-full sm:flex-1" size="lg" disabled={loading}>
              {loading ? t("sending") : t("forgotSendCode")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={loading}
              onClick={() => switchTab("signin")}
            >
              {t("backToSignin")}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "otp" ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="otp" className="text-center sm:text-left">
              {t("otp")}
            </Label>
            <div className="flex justify-center">
              <InputOTP
                id="otp"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  otpRef.current = v;
                }}
                onComplete={() => void verifyWithToken(otpRef.current)}
                disabled={loading}
                containerClassName="gap-0"
                className="disabled:cursor-not-allowed"
              >
                <InputOTPGroup className="shadow-sm">
                  <InputOTPSlot index={0} className="size-10 text-base sm:size-11 sm:text-lg" />
                  <InputOTPSlot index={1} className="size-10 text-base sm:size-11 sm:text-lg" />
                  <InputOTPSlot index={2} className="size-10 text-base sm:size-11 sm:text-lg" />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup className="shadow-sm">
                  <InputOTPSlot index={3} className="size-10 text-base sm:size-11 sm:text-lg" />
                  <InputOTPSlot index={4} className="size-10 text-base sm:size-11 sm:text-lg" />
                  <InputOTPSlot index={5} className="size-10 text-base sm:size-11 sm:text-lg" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <p className="text-center text-xs text-muted-foreground">{t("otpFormatHint")}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={loading}
              onClick={() => {
                setStep("main");
                setOtp("");
                setMessage(null);
                setResendCooldown(0);
              }}
            >
              {t("back")}
            </Button>
            <Button
              type="button"
              className="w-full sm:min-w-[10rem] sm:flex-1"
              size="lg"
              disabled={loading || otp.length !== 6}
              onClick={() => void verifyWithToken(otp)}
            >
              {loading ? t("verifying") : tab === "forgot" ? t("forgotVerify") : t("verify")}
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full whitespace-normal py-2 text-muted-foreground hover:text-foreground"
              disabled={loading || resendCooldown > 0}
              onClick={() => void requestOtpEmail({resend: true, createUser: tab !== "forgot"})}
            >
              {resendCooldown > 0 ? t("resendWait", {seconds: resendCooldown}) : t("resendCode")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "newpw" && tab === "forgot" ? (
        <form className="space-y-4" onSubmit={submitForgotNewPassword}>
          <div className="space-y-2">
            <Label htmlFor="forgot-new-password">{t("forgotNewPassword")}</Label>
            <Input
              id="forgot-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forgot-new-password2">{t("forgotConfirmPassword")}</Label>
            <Input
              id="forgot-new-password2"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("forgotSaving") : t("forgotSubmit")}
          </Button>
        </form>
      ) : null}

      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      {step === "otp" ? <p className="text-xs leading-relaxed text-muted-foreground">{t("otpOnlyHint")}</p> : null}
    </div>
  );
}
