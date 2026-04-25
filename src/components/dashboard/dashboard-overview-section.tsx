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
  status: string;
};

type Props = {
  locale: AppLocale;
  inProgress: number;
  pendingDelivery: number;
  closed: number;
  recent: DashboardRecentRow[];
  totalProjects: number;
};

function caseNumberFromId(id: string) {
  const head = id.split("-")[0] ?? id;
  return head.toUpperCase();
}

export async function DashboardOverviewSection({
  locale,
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
        <p className="mt-1 text-sm text-muted-foreground">{t("welcome")}</p>
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
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[8rem] font-mono">{t("colCaseNumber")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm font-medium" title={row.id}>
                      #{caseNumberFromId(row.id)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {statusLabels[row.status] ?? row.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
