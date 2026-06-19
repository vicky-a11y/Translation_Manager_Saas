import {createAnonPublicClient} from "@/lib/supabase/anon-browser-client";

export type IntakePreview = {
  valid: boolean;
  tenantName?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePreview(data: unknown): IntakePreview {
  if (data == null) return {valid: false};
  if (typeof data === "string") {
    try {
      return parsePreview(JSON.parse(data));
    } catch {
      return {valid: false};
    }
  }
  if (typeof data !== "object" || Array.isArray(data)) return {valid: false};
  const row = data as {valid?: boolean | string; tenant_name?: string};
  const valid = row.valid === true || row.valid === "true";
  if (!valid) return {valid: false};
  return {valid: true, tenantName: row.tenant_name?.trim() || undefined};
}

/** 公開收件連結預覽：僅回傳是否有效與租戶名稱。 */
export async function loadIntakePreview(rawToken: string): Promise<IntakePreview> {
  const token = rawToken.trim().toLowerCase();
  if (!UUID_RE.test(token)) {
    return {valid: false};
  }

  const supabase = createAnonPublicClient();
  const {data, error} = await supabase.rpc("customer_intake_preview", {p_token: token});
  if (error) {
    return {valid: false};
  }
  return parsePreview(data);
}
