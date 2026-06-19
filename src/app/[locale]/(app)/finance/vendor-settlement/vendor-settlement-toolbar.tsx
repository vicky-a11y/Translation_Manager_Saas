"use client";

import {Download} from "lucide-react";
import {useRouter, usePathname} from "next/navigation";

import {Button} from "@/components/ui/button";

type ExportRow = {
  translator: string;
  assigneeId: string;
  lineName: string;
  projectCount: number;
  pendingFee: number;
  settledFee: number;
  totalFee: number;
};

type CsvHeaders = {
  translator: string;
  assigneeId: string;
  lineName: string;
  projectCount: string;
  pendingFee: string;
  settledFee: string;
  totalFee: string;
};

interface VendorSettlementToolbarProps {
  locale: string;
  year: number;
  month: number;
  selectedAssignee: string;
  options: Array<{value: string; label: string}>;
  monthLabel: string;
  rows: ExportRow[];
  labels: {
    translatorLabel: string;
    allTranslators: string;
    export: string;
    csvHeaders: CsvHeaders;
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function VendorSettlementToolbar({
  year,
  month,
  selectedAssignee,
  options,
  monthLabel,
  rows,
  labels,
}: VendorSettlementToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const onSelectTranslator = (assignee: string) => {
    const params = new URLSearchParams({year: String(year), month: String(month)});
    if (assignee && assignee !== "all") {
      params.set("assignee", assignee);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const onExport = () => {
    const {csvHeaders} = labels;
    const header = [
      csvHeaders.translator,
      csvHeaders.assigneeId,
      csvHeaders.lineName,
      csvHeaders.projectCount,
      csvHeaders.pendingFee,
      csvHeaders.settledFee,
      csvHeaders.totalFee,
    ];
    const lines = rows.map((r) =>
      [r.translator, r.assigneeId, r.lineName, r.projectCount, r.pendingFee, r.settledFee, r.totalFee]
        .map(escapeCsvCell)
        .join(","),
    );
    const csv = [header.map(escapeCsvCell).join(","), ...lines].join("\r\n");
    // UTF-8 BOM 讓 Excel 正確辨識中文
    const blob = new Blob([`\uFEFF${csv}`], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-settlement-${monthLabel}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">{labels.translatorLabel}</span>
        <select
          value={selectedAssignee}
          onChange={(e) => onSelectTranslator(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="all">{labels.allTranslators}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <Button variant="outline" size="sm" onClick={onExport} disabled={rows.length === 0}>
        <Download />
        {labels.export}
      </Button>
    </div>
  );
}
