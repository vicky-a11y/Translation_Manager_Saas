import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";

import {normalizeInviteToken} from "./normalize-invite-token";

export type InvitePreview = {
  valid: boolean;
  tenantName?: string;
  rpcError?: string;
};

function parsePreviewPayload(data: unknown): InvitePreview {
  if (data == null) {
    return {valid: false};
  }

  if (typeof data === "string") {
    try {
      return parsePreviewPayload(JSON.parse(data));
    } catch {
      return {valid: false};
    }
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return {valid: false};
  }

  const row = data as {valid?: boolean | string; tenant_name?: string};
  const valid = row.valid === true || row.valid === "true";
  if (!valid) {
    return {valid: false};
  }

  return {valid: true, tenantName: row.tenant_name?.trim() || undefined};
}

export async function loadInvitePreview(rawToken: string): Promise<InvitePreview> {
  const token = normalizeInviteToken(rawToken);
  if (!token) {
    return {valid: false};
  }

  const supabase = createAnonPublicClient();
  const {data, error} = await supabase.rpc("invitation_public_preview", {p_token: token});

  if (error) {
    const {data: active, error: activeError} = await supabase.rpc("invitation_token_active", {p_token: token});
    if (activeError) {
      return {valid: false, rpcError: activeError.message};
    }
    return {valid: Boolean(active)};
  }

  return parsePreviewPayload(data);
}
