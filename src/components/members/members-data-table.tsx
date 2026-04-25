"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";

import {removeMemberFromTenant} from "@/app/[locale]/actions/members";
import {Button} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import type {PermissionFlags} from "@/lib/permissions/types";
import {parsePermissions} from "@/lib/permissions/parse-permissions";

import {MemberPermissionsDialog} from "./member-permissions-dialog";

export type MemberTableRow = {
  id: string;
  full_name: string | null;
  membershipRole: string;
  profileRole: string;
  permissions: PermissionFlags;
};

type Props = {
  locale: string;
  rows: MemberTableRow[];
  currentUserId: string;
  canEditMemberPermissions: boolean;
  canRemoveMembers: boolean;
};

export function MembersDataTable({
  locale,
  rows,
  currentUserId,
  canEditMemberPermissions,
  canRemoveMembers,
}: Props) {
  const t = useTranslations("Members");
  const [dialog, setDialog] = useState<{open: boolean; row: MemberTableRow | null}>({open: false, row: null});

  const columns = useMemo<ColumnDef<MemberTableRow>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: t("colName"),
        cell: ({row}) => <span className="font-medium text-foreground">{row.original.full_name ?? row.original.id}</span>,
      },
      {
        accessorKey: "membershipRole",
        header: t("colMembershipRole"),
        cell: ({row}) => <span className="text-muted-foreground">{row.original.membershipRole}</span>,
      },
      {
        accessorKey: "profileRole",
        header: t("colProfileRole"),
        cell: ({row}) => <span className="text-muted-foreground">{row.original.profileRole}</span>,
      },
      {
        id: "actions",
        header: t("colActions"),
        cell: ({row}) => {
          const r = row.original;
          if (r.id === currentUserId) {
            return <span className="text-xs text-muted-foreground">{t("you")}</span>;
          }
          return (
            <div className="flex flex-wrap items-center gap-2">
              {canEditMemberPermissions ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDialog({open: true, row: r})}>
                  {t("permissionSettings")}
                </Button>
              ) : null}
              {canRemoveMembers ? (
                <form action={removeMemberFromTenant}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="user_id" value={r.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    {t("remove")}
                  </Button>
                </form>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canEditMemberPermissions, canRemoveMembers, currentUserId, locale, t],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                {t("emptyMembers")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {dialog.row ? (
        <MemberPermissionsDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({open, row: open ? d.row : null}))}
          locale={locale}
          targetUserId={dialog.row.id}
          targetName={dialog.row.full_name ?? dialog.row.id}
          initial={parsePermissions(dialog.row.permissions)}
        />
      ) : null}
    </>
  );
}
