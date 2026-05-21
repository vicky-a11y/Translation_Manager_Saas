"use client";

import * as React from "react";

import {
  deleteProjectTranslatorAssignmentAction,
  searchActiveTranslatorsAction,
  upsertProjectTranslatorAssignmentAction,
  type TranslatorSearchOption,
  type UpsertAssignmentState,
} from "./actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

type AssignmentRow = {
  id: string;
  assigneeId: string;
  translatorLabel: string;
  translatorFee: number;
  translatorDeadline: string | null;
};

type DraftRow = {
  key: string;
  id?: string;
  assigneeId: string;
  translatorLabel: string;
  translatorFee: string;
  translatorDeadline: string;
  editing: boolean;
};

function isoToDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function moneyFromInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return "";
  const n = Number(normalized);
  if (!Number.isFinite(n)) return value;
  return String(Math.round(n));
}

function newDraftFromRow(row?: AssignmentRow): DraftRow {
  const key = row?.id ?? `new-${crypto.randomUUID()}`;
  return {
    key,
    id: row?.id,
    assigneeId: row?.assigneeId ?? "",
    translatorLabel: row?.translatorLabel ?? "",
    translatorFee: row ? String(Math.round(row.translatorFee ?? 0)) : "0",
    translatorDeadline: row ? isoToDateTimeLocal(row.translatorDeadline) : "",
    editing: !row,
  };
}

export function ProjectAssignmentsEditor(props: {
  locale: string;
  projectId: string;
  labels: {
    heading: string;
    add: string;
    translator: string;
    translatorPlaceholder: string;
    translatorSearching: string;
    translatorNoMatches: string;
    fee: string;
    deadline: string;
    edit: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    errorValidation: string;
    errorGeneric: string;
    saved: string;
  };
  initial: AssignmentRow[];
}) {
  const {labels} = props;
  const [rows, setRows] = React.useState<DraftRow[]>(props.initial.map((r) => newDraftFromRow(r)));
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [errorByKey, setErrorByKey] = React.useState<Record<string, string | null>>({});

  function addRow() {
    setRows((prev) => [...prev, newDraftFromRow()]);
  }

  function setRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? {...r, ...patch} : r)));
  }

  async function doSave(row: DraftRow) {
    setSavingKey(row.key);
    setErrorByKey((prev) => ({...prev, [row.key]: null}));
    try {
      const fd = new FormData();
      fd.set("locale", props.locale);
      fd.set("project_id", props.projectId);
      if (row.id) fd.set("assignment_id", row.id);
      fd.set("assignee_id", row.assigneeId);
      fd.set("translator_fee", row.translatorFee);
      fd.set("translator_deadline", row.translatorDeadline);

      const res: UpsertAssignmentState = await upsertProjectTranslatorAssignmentAction({}, fd);
      if (res.ok) {
        setSavedAt(Date.now());
        setRow(row.key, {editing: false, id: res.assignmentId ?? row.id});
      } else {
        setErrorByKey((prev) => ({
          ...prev,
          [row.key]: res.errorKey === "validation" ? labels.errorValidation : labels.errorGeneric,
        }));
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function doDelete(row: DraftRow) {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }

    setSavingKey(row.key);
    try {
      const fd = new FormData();
      fd.set("locale", props.locale);
      fd.set("project_id", props.projectId);
      fd.set("assignment_id", row.id);
      const res = await deleteProjectTranslatorAssignmentAction(fd);
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.key !== row.key));
      } else {
        setErrorByKey((prev) => ({...prev, [row.key]: labels.errorGeneric}));
      }
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{labels.heading}</p>
          {savedAt ? <p className="text-xs text-muted-foreground">{labels.saved}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={addRow}>
          {labels.add}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {labels.add}
          </p>
        ) : null}

        {rows.map((row) => (
          <AssignmentCard
            key={row.key}
            locale={props.locale}
            labels={labels}
            row={row}
            saving={savingKey === row.key}
            errorText={errorByKey[row.key] ?? null}
            onChange={(patch) => setRow(row.key, patch)}
            onSave={() => doSave(row)}
            onDelete={() => doDelete(row)}
          />
        ))}
      </div>
    </div>
  );
}

function AssignmentCard(props: {
  locale: string;
  labels: ProjectAssignmentsEditorProps["labels"];
  row: DraftRow;
  saving: boolean;
  errorText: string | null;
  onChange: (patch: Partial<DraftRow>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const {labels, row} = props;
  const [query, setQuery] = React.useState<string>("");
  const [options, setOptions] = React.useState<TranslatorSearchOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!row.editing) return;
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchActiveTranslatorsAction(query)
      .then((res) => {
        if (cancelled) return;
        setOptions(res);
        setOpen(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, row.editing]);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const canEdit = row.editing;

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{row.translatorLabel || "—"}</p>
          {props.errorText ? <p className="text-xs text-destructive">{props.errorText}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!row.editing ? (
            <Button variant="outline" size="sm" onClick={() => props.onChange({editing: true})}>
              {labels.edit}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onChange({editing: false})}
                disabled={props.saving}
              >
                {labels.cancel}
              </Button>
              <Button size="sm" onClick={props.onSave} disabled={props.saving}>
                {props.saving ? labels.saving : labels.save}
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={props.onDelete}
            disabled={props.saving}
          >
            {labels.delete}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div ref={containerRef} className="relative sm:col-span-1">
          <label className="text-xs text-muted-foreground">{labels.translator}</label>
          {!canEdit ? (
            <p className="mt-1 text-sm text-muted-foreground">{row.translatorLabel || "—"}</p>
          ) : (
            <>
              <Input
                value={query || row.translatorLabel}
                placeholder={labels.translatorPlaceholder}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  props.onChange({translatorLabel: v});
                }}
                onFocus={() => setOpen(true)}
              />
              {open ? (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                  <div className="max-h-56 overflow-auto py-1">
                    {loading ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">{labels.translatorSearching}</div>
                    ) : options.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">{labels.translatorNoMatches}</div>
                    ) : (
                      options.map((opt) => (
                        <button
                          key={opt.translatorId}
                          type="button"
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted",
                            opt.translatorId === row.assigneeId ? "bg-muted" : "",
                          )}
                          onClick={() => {
                            props.onChange({
                              assigneeId: opt.translatorId,
                              translatorLabel: opt.label,
                            });
                            setQuery("");
                            setOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="sm:col-span-1">
          <label className="text-xs text-muted-foreground">{labels.fee}</label>
          {!canEdit ? (
            <p className="mt-1 text-sm text-muted-foreground">{row.translatorFee || "—"}</p>
          ) : (
            <Input
              value={row.translatorFee}
              inputMode="numeric"
              onChange={(e) => props.onChange({translatorFee: moneyFromInput(e.target.value)})}
            />
          )}
        </div>

        <div className="sm:col-span-1">
          <label className="text-xs text-muted-foreground">{labels.deadline}</label>
          {!canEdit ? (
            <p className="mt-1 text-sm text-muted-foreground">{row.translatorDeadline || "—"}</p>
          ) : (
            <Input
              type="datetime-local"
              value={row.translatorDeadline}
              onChange={(e) => props.onChange({translatorDeadline: e.target.value})}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type ProjectAssignmentsEditorProps = React.ComponentProps<typeof ProjectAssignmentsEditor>;

