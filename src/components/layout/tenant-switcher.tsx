"use client";

import {useTransition} from "react";
import {Building2, ChevronsUpDown} from "lucide-react";

import {switchActiveTenant} from "@/app/[locale]/actions/tenant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {AppLocale} from "@/i18n/routing";

export type TenantSwitcherOption = {
  id: string;
  name: string;
};

type TenantSwitcherProps = {
  locale: AppLocale;
  currentTenantId: string;
  tenants: TenantSwitcherOption[];
  labelWorkspace: string;
  labelSwitch: string;
};

export function TenantSwitcher({locale, currentTenantId, tenants, labelWorkspace, labelSwitch}: TenantSwitcherProps) {
  const [pending, startTransition] = useTransition();
  const current = tenants.find((t) => t.id === currentTenantId) ?? tenants[0];
  const showSwitcher = tenants.length > 1;

  if (!current) {
    return null;
  }

  if (!showSwitcher) {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{labelWorkspace}</p>
        <p className="truncate text-sm font-semibold text-foreground">{current.name}</p>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{labelWorkspace}</p>
        <DropdownMenuTrigger className="flex h-auto w-full max-w-full items-center gap-2 rounded-md px-0 py-0 text-left font-semibold outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{current.name}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{labelSwitch}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            disabled={t.id === currentTenantId || pending}
            onClick={() => {
              if (t.id === currentTenantId) return;
              startTransition(async () => {
                const fd = new FormData();
                fd.set("locale", locale);
                fd.set("tenant_id", t.id);
                await switchActiveTenant(fd);
              });
            }}
          >
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
