import {createTenantScopedSupabase} from "@/lib/supabase/tenant-scoped-client";

import type {TenantContext} from "./tenant-context";

export type ProjectFinanceAuditQuery = {
  projectId?: string;
  fieldNames?: string[];
  fromModifiedAt?: string;
  toModifiedAt?: string;
  page?: number;
  pageSize?: number;
};

export type ProjectFinanceAuditRow = {
  id: string;
  record_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  user_id: string | null;
  actor_name: string | null;
  modified_at: string;
};

function normalizePage(page?: number): number {
  if (!page || !Number.isInteger(page) || page < 1) return 1;
  return page;
}

function normalizePageSize(pageSize?: number): number {
  if (!pageSize || !Number.isInteger(pageSize)) return 20;
  return Math.min(Math.max(pageSize, 1), 100);
}

/**
 * 財務異動紀錄查詢（project_financials -> system_audit_logs）。
 * - 強制限定 table_name = project_financials
 * - 透過 tenant-scoped client 保障 tenant_id 範圍
 * - 回補 actor_name（profiles.full_name）以利後台呈現
 */
export function createProjectFinanceAuditRepository(ctx: TenantContext) {
  const scoped = () => createTenantScopedSupabase(ctx.supabase, ctx.tenantId);

  return {
    scoped,

    async list(query: ProjectFinanceAuditQuery) {
      const page = normalizePage(query.page);
      const pageSize = normalizePageSize(query.pageSize);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let req = scoped()
        .from("system_audit_logs")
        .select("id, record_id, field_name, old_value, new_value, user_id, modified_at", {count: "exact"})
        .eq("table_name", "project_financials")
        .order("modified_at", {ascending: false})
        .range(from, to);

      if (query.projectId) {
        req = req.eq("record_id", query.projectId);
      }
      if (query.fieldNames && query.fieldNames.length > 0) {
        req = req.in("field_name", query.fieldNames);
      }
      if (query.fromModifiedAt) {
        req = req.gte("modified_at", query.fromModifiedAt);
      }
      if (query.toModifiedAt) {
        req = req.lte("modified_at", query.toModifiedAt);
      }

      const {data, error, count} = await req;
      if (error) {
        return {data: [] as ProjectFinanceAuditRow[], count: 0, error};
      }

      const rows = (data ?? []) as Array<{
        id: string;
        record_id: string;
        field_name: string;
        old_value: string | null;
        new_value: string | null;
        user_id: string | null;
        modified_at: string;
      }>;

      const actorIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
      const actorNameMap = new Map<string, string>();

      if (actorIds.length > 0) {
        const {data: profiles} = await ctx.supabase.from("profiles").select("id, full_name").in("id", actorIds);
        for (const p of profiles ?? []) {
          const row = p as {id: string; full_name: string | null};
          actorNameMap.set(row.id, row.full_name ?? "");
        }
      }

      const mapped: ProjectFinanceAuditRow[] = rows.map((row) => ({
        ...row,
        actor_name: row.user_id ? actorNameMap.get(row.user_id) ?? null : null,
      }));

      return {data: mapped, count: count ?? 0, error: null};
    },
  };
}

