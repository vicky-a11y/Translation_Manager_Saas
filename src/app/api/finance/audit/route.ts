import {NextResponse} from "next/server";

import {parsePermissions} from "@/lib/permissions/parse-permissions";
import {createProjectFinanceAuditRepository} from "@/lib/repositories/project-finance-audit-repository";
import type {ProfileRole} from "@/lib/permissions/types";
import {createClient} from "@/lib/supabase/server";
import {getWorkspaceTenantId} from "@/lib/tenant/workspace";

function toInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return n;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({error: "auth_required"}, {status: 401});
  }

  const {data: profile} = await supabase
    .from("profiles")
    .select("tenant_id, active_tenant_id, role, permissions")
    .eq("id", user.id)
    .maybeSingle();

  const tenantId = getWorkspaceTenantId(profile);
  if (!tenantId) {
    return NextResponse.json({error: "no_workspace"}, {status: 400});
  }

  const isSuper = (profile?.role as ProfileRole | undefined) === "super_admin";
  const flags = parsePermissions(profile?.permissions);
  if (!isSuper && !flags.can_view_finance) {
    return NextResponse.json({error: "forbidden"}, {status: 403});
  }

  const {searchParams} = new URL(request.url);
  const projectId = searchParams.get("project_id")?.trim() || undefined;
  const fromModifiedAt = searchParams.get("from")?.trim() || undefined;
  const toModifiedAt = searchParams.get("to")?.trim() || undefined;
  const page = toInt(searchParams.get("page"), 1);
  const pageSize = toInt(searchParams.get("page_size"), 20);
  const fieldNames = searchParams
    .getAll("field")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const repo = createProjectFinanceAuditRepository({supabase, tenantId});
  const {data, count, error} = await repo.list({
    projectId,
    fieldNames,
    fromModifiedAt,
    toModifiedAt,
    page,
    pageSize,
  });

  if (error) {
    return NextResponse.json({error: "database_error"}, {status: 500});
  }

  return NextResponse.json({
    data,
    paging: {
      page,
      pageSize,
      total: count,
    },
  });
}

