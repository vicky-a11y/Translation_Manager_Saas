"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";

import {createClient} from "@/lib/supabase/server";

export async function switchActiveTenant(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "").trim();
  const nextTenantId = String(formData.get("tenant_id") ?? "").trim();

  if (!locale || !nextTenantId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const {data: membership, error: memErr} = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("tenant_id", nextTenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (memErr || !membership) {
    return;
  }

  const {error} = await supabase
    .from("profiles")
    .update({
      active_tenant_id: nextTenantId,
      tenant_id: nextTenantId,
    })
    .eq("id", user.id);

  if (error) {
    return;
  }

  revalidatePath(`/${locale}`, "layout");
}
