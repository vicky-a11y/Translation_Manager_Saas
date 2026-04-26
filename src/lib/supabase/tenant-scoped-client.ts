import type {SupabaseClient} from "@supabase/supabase-js";

/**
 * 透過 PostgREST 查詢業務表時，預設附加 tenant_id 等於目前工作區，降低漏寫篩選的風險。
 * 新表上線時請加入此集合；非租戶範圍表（如 profiles）勿加入。
 */
export const TENANT_SCOPED_TABLES = new Set<string>([
  "projects",
  "project_financials",
  "customer_master",
  "customer_contacts",
  "system_audit_logs",
  "invitations",
]);

/**
 * 包一層 Supabase client：`from(租戶表)` 時自動 `.eq("tenant_id", tenantId)`。
 * 仍須搭配 RLS；此為應用層 Global Query Scoping 輔助。
 *
 * 註：無 Database 泛型時，`from()` 回傳的 builder 型別不一定暴露 `.eq`，此處以窄化 cast 銜接執行期 API。
 */
export function createTenantScopedSupabase(client: SupabaseClient, tenantId: string): SupabaseClient {
  const from = (table: string) => {
    const builder = client.from(table);
    if (!TENANT_SCOPED_TABLES.has(table)) {
      return builder;
    }

    return new Proxy(builder as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if ((prop === "select" || prop === "update" || prop === "delete") && typeof value === "function") {
          return (...args: unknown[]) => {
            const query = value.apply(target, args) as {eq: (column: string, value: string) => unknown};
            return query.eq("tenant_id", tenantId);
          };
        }
        return value;
      },
    });
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return from;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}
