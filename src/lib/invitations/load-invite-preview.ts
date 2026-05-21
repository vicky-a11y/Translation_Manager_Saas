import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";

import {normalizeInviteToken} from "./normalize-invite-token";

export type InvitePreview = {
  valid: boolean;
  tenantName?: string;
  reason?: "expired" | "not_found" | "malformed";
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

  const row = data as {valid?: boolean | string; tenant_name?: string; reason?: string};
  const valid = row.valid === true || row.valid === "true";
  if (!valid) {
    const reason = row.reason === "expired" ? "expired" : "not_found";
    return {valid: false, reason};
  }

  return {valid: true, tenantName: row.tenant_name?.trim() || undefined};
}

export async function loadInvitePreview(rawToken: string): Promise<InvitePreview> {
  const token = normalizeInviteToken(rawToken);
  if (!token) {
    return {valid: false, reason: "malformed"};
  }

  const supabase = createAnonPublicClient();
  const {data, error} = await supabase.rpc("invitation_public_preview", {p_token: token});

  if (error) {
    const {data: active, error: activeError} = await supabase.rpc("invitation_token_active", {p_token: token});
    if (activeError) {
      return {valid: false, reason: "not_found", rpcError: activeError.message};
    }
    return {valid: Boolean(active), reason: active ? undefined : "not_found"};
  }

  return parsePreviewPayload(data);
}
