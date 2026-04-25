"use server";

import {revalidatePath} from "next/cache";

import {createClient} from "@/lib/supabase/server";
import type {PermissionFlags} from "@/lib/permissions/types";

export async function saveMemberPermissions(
  locale: string,
  targetUserId: string,
  permissions: PermissionFlags,
): Promise<{ok: true} | {ok: false; message: string}> {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return {ok: false, message: "not_authenticated"};
  }

  const {error} = await supabase.rpc("admin_set_member_permissions", {
    p_target: targetUserId,
    p_permissions: permissions,
  });

  if (error) {
    return {ok: false, message: error.message};
  }

  revalidatePath(`/${locale}/members`, "page");
  revalidatePath(`/${locale}`, "layout");
  return {ok: true};
}
