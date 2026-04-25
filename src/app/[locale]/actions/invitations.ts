"use server";

import {revalidatePath} from "next/cache";

import {createClient} from "@/lib/supabase/server";

export async function acceptInvitation(token: string, locale: string) {
  const supabase = await createClient();
  const {error} = await supabase.rpc("accept_invitation", {p_token: token});
  if (error) {
    return {ok: false as const, message: error.message};
  }
  revalidatePath(`/${locale}`, "layout");
  revalidatePath(`/${locale}/welcome`, "layout");
  return {ok: true as const};
}

export async function declineInvitation(token: string, locale: string) {
  const supabase = await createClient();
  const {error} = await supabase.rpc("decline_invitation", {p_token: token});
  if (error) {
    return {ok: false as const, message: error.message};
  }
  revalidatePath(`/${locale}/welcome`, "layout");
  return {ok: true as const};
}
