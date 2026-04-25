import {createTenantScopedSupabase} from "@/lib/supabase/tenant-scoped-client";

import type {TenantContext} from "./tenant-context";

/**
 * 案件（projects）查詢邊界：`scoped()` 已依 TenantContext.tenantId（即作用中工作區）注入 `tenant_id`。
 */
export function createProjectsRepository(ctx: TenantContext) {
  const scoped = () => createTenantScopedSupabase(ctx.supabase, ctx.tenantId);

  return {
    scoped,

    /** 與 `dashboardInProgressExcludedForQuery()` 回傳格式一致（PostgREST `in` 括號字串）。 */
    countHeadNotInStatuses(excludedStatusesFilter: string) {
      return scoped()
        .from("projects")
        .select("*", {count: "exact", head: true})
        .not("status", "in", excludedStatusesFilter);
    },

    countHeadInStatuses(statuses: readonly string[]) {
      return scoped()
        .from("projects")
        .select("*", {count: "exact", head: true})
        .in("status", [...statuses]);
    },

    listRecentIdStatus(limit: number) {
      return scoped().from("projects").select("id, status").order("created_at", {ascending: false}).limit(limit);
    },

    countHeadAll() {
      return scoped().from("projects").select("*", {count: "exact", head: true});
    },
  };
}
