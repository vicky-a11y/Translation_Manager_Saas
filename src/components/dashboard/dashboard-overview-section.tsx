import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {AppLocale} from "@/i18n/routing";

export type DashboardRecentRow = {
  id: string;
  project_code: string | null;
  title: string;
  delivery_deadline: string | null;
  status: string;
};

type Props = {
  locale: AppLocale;
  displayName: string | null;
  inProgress: number;
  pendingDelivery: number;
  closed: number;
  recent: DashboardRecentRow[];
  totalProjects: number;
};

function formatDateTime(value: string | null, locale: AppLocale) {
  if (!value) return "—";
  try {
    const tag = locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
  } catch {
    return value;
  }
}

function isOverdue(deadlineIso: string | null) {
  if (!deadlineIso) return false;
  const ms = new Date(deadlineIso).getTime();
  return Number.isFinite(ms) && ms < Date.now();
}

export async function DashboardOverviewSection({
  locale,
  displayName,
  inProgress,
  pendingDelivery,
  closed,
  recent,
  totalProjects,
}: Props) {
  const t = await getTranslations({locale, namespace: "Dashboard"});

  const statusLabels: Record<string, string> = {
    draft: t("statusLabel.draft"),
    quoted: t("statusLabel.quoted"),
    in_progress: t("statusLabel.in_progress"),
    processing: t("statusLabel.processing"),
    review: t("statusLabel.review"),
    pending: t("statusLabel.pending"),
    assigned: t("statusLabel.assigned"),
    delivered: t("statusLabel.delivered"),
    completed: t("statusLabel.completed"),
    cancelled: t("statusLabel.cancelled"),
  };

  const statCards = [
    {label: t("statInProgress"), value: inProgress},
    {label: t("statPendingDelivery"), value: pendingDelivery},
    {label: t("statClosed"), value: closed},
  ];

  const showEmpty = totalProjects === 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {displayName ? t("welcomeWithName", {name: displayName}) : t("welcome")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{t("recentHeading")}</h3>
        {showEmpty ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("emptyNoProjects")}
          </p>
        ) : recent.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("emptyRecentList")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[7rem] whitespace-nowrap">{t("colProjectCode")}</TableHead>
                  <TableHead className="min-w-[10rem]">{t("colTitle")}</TableHead>
                  <TableHead className="min-w-[9rem] whitespace-nowrap">{t("colDeliveryDeadline")}</TableHead>
                  <TableHead className="min-w-[6rem] whitespace-nowrap">{t("colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => {
                  const detailHref = `/${locale}/projects/${row.id}`;
                  const overdue = isOverdue(row.delivery_deadline);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link href={detailHref} className="text-primary underline-offset-4 hover:underline">
                          {row.project_code?.trim() || row.id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate" title={row.title}>
                        <Link href={detailHref} className="text-primary underline-offset-4 hover:underline">
                          {row.title}
                        </Link>
                      </TableCell>
                      <TableCell
                        className={
                          overdue ? "whitespace-nowrap font-medium text-destructive" : "whitespace-nowrap text-muted-foreground"
                        }
                      >
                        {formatDateTime(row.delivery_deadline, locale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {statusLabels[row.status] ?? row.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
