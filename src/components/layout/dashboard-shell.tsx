"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {Building2, FolderKanban, LayoutDashboard, Settings2, UserRound, Users, Wallet} from "lucide-react";

import {LogoutButton} from "@/components/auth/logout-button";
import {usePermission} from "@/hooks/use-permission";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {Separator} from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type {AppLocale} from "@/i18n/routing";

import {LanguageSwitcher} from "./language-switcher";
import {TenantSwitcher, type TenantSwitcherOption} from "./tenant-switcher";

type NavLabels = {
  dashboard: string;
  members: string;
  projects: string;
  customers: string;
  settings: string;
  finance: string;
  account: string;
  logout: string;
  tenantWorkspace: string;
  tenantSwitch: string;
};

type DashboardShellProps = {
  locale: AppLocale;
  tenantName: string;
  currentTenantId: string;
  workspaceTenants: TenantSwitcherOption[];
  labels: NavLabels;
  children: React.ReactNode;
};

export function DashboardShell({
  locale,
  tenantName,
  currentTenantId,
  workspaceTenants,
  labels,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const {can, canSeeMembersNav} = usePermission();
  const base = `/${locale}`;
  const dashboardPath = `${base}/dashboard`;
  const membersPath = `${base}/members`;
  const financePath = `${base}/finance`;
  const projectsPath = `${base}/projects`;
  const customersPath = `${base}/customers`;
  const settingsPath = `${base}/settings`;
  const accountPath = `${base}/account`;

  const dashboardActive =
    pathname === dashboardPath || pathname === `${dashboardPath}/` || pathname === base || pathname === `${base}/`;
  const membersActive = pathname === membersPath || pathname.startsWith(`${membersPath}/`);
  const financeActive = pathname === financePath || pathname.startsWith(`${financePath}/`);
  const projectsActive = pathname === projectsPath || pathname.startsWith(`${projectsPath}/`);
  const customersActive = pathname === customersPath || pathname.startsWith(`${customersPath}/`);
  const settingsActive = pathname === settingsPath || pathname.startsWith(`${settingsPath}/`);
  const accountActive = pathname === accountPath || pathname.startsWith(`${accountPath}/`);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="gap-2 border-b border-sidebar-border px-2 py-3">
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PINCHIEH TMS</p>
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{tenantName}</p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">{labels.dashboard}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={dashboardActive}
                    tooltip={labels.dashboard}
                    render={<Link href={dashboardPath} />}
                  >
                    <LayoutDashboard className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{labels.dashboard}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {canSeeMembersNav ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={membersActive}
                      tooltip={labels.members}
                      render={<Link href={membersPath} />}
                    >
                      <Users className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.members}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {can("can_view_finance") ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={financeActive}
                      tooltip={labels.finance}
                      render={<Link href={financePath} />}
                    >
                      <Wallet className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.finance}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={accountActive}
                    tooltip={labels.account}
                    render={<Link href={accountPath} />}
                  >
                    <UserRound className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{labels.account}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  {can("can_edit_projects") ? (
                    <SidebarMenuButton
                      isActive={projectsActive}
                      tooltip={labels.projects}
                      render={<Link href={projectsPath} />}
                    >
                      <FolderKanban className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.projects}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton disabled tooltip={labels.projects}>
                      <FolderKanban className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.projects}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
                <SidebarMenuItem>
                  {can("can_edit_projects") ? (
                    <SidebarMenuButton
                      isActive={customersActive}
                      tooltip={labels.customers}
                      render={<Link href={customersPath} />}
                    >
                      <Building2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.customers}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton disabled tooltip={labels.customers}>
                      <Building2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.customers}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
                <SidebarMenuItem>
                  {can("can_access_settings") ? (
                    <SidebarMenuButton
                      isActive={settingsActive}
                      tooltip={labels.settings}
                      render={<Link href={settingsPath} />}
                    >
                      <Settings2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.settings}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton disabled tooltip={labels.settings}>
                      <Settings2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{labels.settings}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <LogoutButton
            locale={locale}
            label={labels.logout}
            className="flex h-9 min-w-0 w-full items-center justify-start gap-2 truncate rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <TenantSwitcher
            locale={locale}
            currentTenantId={currentTenantId}
            tenants={workspaceTenants.length > 0 ? workspaceTenants : [{id: currentTenantId, name: tenantName}]}
            labelWorkspace={labels.tenantWorkspace}
            labelSwitch={labels.tenantSwitch}
          />
          <LanguageSwitcher currentLocale={locale} />
          <Avatar className="size-9 border border-border">
            <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">MP</AvatarFallback>
          </Avatar>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
