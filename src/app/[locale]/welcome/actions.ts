"use server";

import {revalidatePath} from "next/cache";

import {createClient} from "@/lib/supabase/server";

type SimpleResult = {ok: true} | {ok: false; code: "auth" | "unknown"};

export async function updateWelcomeProfile(formData: FormData): Promise<SimpleResult> {
  const locale = String(formData.get("locale") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const languagePreference = String(formData.get("language_preference") ?? "zh-TW").trim();

  if (!locale || !fullName) {
    return {ok: false, code: "unknown"};
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, code: "auth"};
  }

  const {error} = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      language_preference: languagePreference,
    })
    .eq("id", user.id);

  if (error) {
    return {ok: false, code: "unknown"};
  }

  revalidatePath(`/${locale}/welcome`, "page");
  revalidatePath(`/${locale}/welcome/vendor`, "page");
  return {ok: true};
}

export async function registerAsPlatformVendor(locale: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, code: "auth"};
  }

  const {error} = await supabase.rpc("set_self_platform_vendor");
  if (error) {
    return {ok: false, code: "unknown"};
  }

  revalidatePath(`/${locale}/welcome`, "page");
  return {ok: true};
}
