/**
 * 目前工作區租戶 ID：優先使用 active_tenant_id（多租戶切換），並與舊版 tenant_id 相容。
 */
export function getWorkspaceTenantId(
  profile: {tenant_id: string | null; active_tenant_id?: string | null} | null | undefined,
): string | null {
  if (!profile) return null;
  return profile.active_tenant_id ?? profile.tenant_id ?? null;
}
