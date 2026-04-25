"use client";

import {useTranslations} from "next-intl";
import {useEffect, useState, useTransition} from "react";

import {saveMemberPermissions} from "@/app/[locale]/actions/permissions";
import {Button} from "@/components/ui/button";
import {Dialog, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import type {PermissionFlags, PermissionKey} from "@/lib/permissions/types";
import {DEFAULT_PERMISSION_FLAGS, PERMISSION_KEYS} from "@/lib/permissions/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  targetUserId: string;
  targetName: string;
  initial: PermissionFlags;
};

export function MemberPermissionsDialog({open, onOpenChange, locale, targetUserId, targetName, initial}: Props) {
  const t = useTranslations("Members.permissions");
  const [draft, setDraft] = useState<PermissionFlags>(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const toggle = (key: PermissionKey, value: boolean) => {
    setDraft((d) => ({...d, [key]: value}));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t("title", {name: targetName})}</DialogTitle>
      </DialogHeader>
      <div className="mt-4 space-y-4">
        {PERMISSION_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label htmlFor={`perm-${key}`} className="flex-1 cursor-pointer text-left font-normal">
              {t(key)}
            </Label>
            <Switch
              id={`perm-${key}`}
              checked={draft[key] ?? DEFAULT_PERMISSION_FLAGS[key]}
              onCheckedChange={(v) => toggle(key, v)}
              disabled={pending}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const res = await saveMemberPermissions(locale, targetUserId, draft);
              if (res.ok) {
                onOpenChange(false);
              }
            });
          }}
        >
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
