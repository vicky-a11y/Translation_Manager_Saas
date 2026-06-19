"use client";

import {useRouter, usePathname} from "next/navigation";

import {cn} from "@/lib/utils";

interface YearMonthFilterProps {
  year: number;
  month: number;
  locale: string;
  yearLabel: string;
}

function localeToBcp47(locale: string): string {
  if (locale === "zh-TW" || locale === "zh-CN") return locale;
  if (locale === "ms") return "ms-MY";
  return "en-US";
}

export function YearMonthFilter({year, month, locale, yearLabel}: YearMonthFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigate = (newYear: number, newMonth: number) => {
    router.push(`${pathname}?year=${newYear}&month=${newMonth}`);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

  const bcp47 = localeToBcp47(locale);
  const monthNames = Array.from({length: 12}, (_, i) =>
    new Intl.DateTimeFormat(bcp47, {month: "short"}).format(new Date(2000, i, 1)),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">{yearLabel}</span>
        <select
          value={year}
          onChange={(e) => navigate(Number(e.target.value), month)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {monthNames.map((name, i) => {
          const m = i + 1;
          const active = month === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => navigate(year, m)}
              className={cn(
                "min-w-[3.5rem] rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
