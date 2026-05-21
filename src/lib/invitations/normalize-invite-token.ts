const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 清理 URL / email 客戶端可能附帶的多餘字元，並驗證 UUID 格式。 */
export function normalizeInviteToken(raw: string | undefined | null): string | null {
  if (!raw) return null;

  let token = raw.trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    // 保留原值
  }

  token = token.trim().replace(/[>)\].,;'"`\s]+$/g, "");

  return UUID_RE.test(token) ? token : null;
}
