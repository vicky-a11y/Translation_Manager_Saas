"use client";

import * as React from "react";
import {useRouter} from "next/navigation";

import {
  deleteProjectAction,
  updateProjectInfoAction,
  type UpdateProjectInfoState,
} from "./actions";
import {
  searchActiveCustomersAction,
  type CustomerSearchOption,
} from "../new/search-customers-action";
import {Button} from "@/components/ui/button";
import {Dialog, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

type ProjectInfoSnapshot = {
  projectCode: string;
  title: string;
  createdAt: string;
  deliveryDeadline: string | null;
  notes: string | null;
  customerId: string;
  customerLabel: string;
};

function localeToBcp47(locale: string) {
  return locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return "—";
  try {
    const tag = localeToBcp47(locale);
    return new Intl.DateTimeFormat(tag, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
  } catch {
    return value;
  }
}

function isoToDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCustomerLabel(c: CustomerSearchOption) {
  return c.cid ? `${c.displayName} (${c.cid})` : c.displayName;
}

function valueOrDash(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

export function ProjectDeleteButton(props: {
  locale: string;
  projectId: string;
  labels: {
    delete: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    no: string;
    yes: string;
    deleting: string;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function doDelete() {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("locale", props.locale);
      fd.set("project_id", props.projectId);
      await deleteProjectAction(fd);
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={pending}>
        {props.labels.delete}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogHeader>
          <DialogTitle>{props.labels.deleteConfirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{props.labels.deleteConfirmBody}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {props.labels.no}
          </Button>
          <Button variant="destructive" onClick={() => void doDelete()} disabled={pending}>
            {pending ? props.labels.deleting : props.labels.yes}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

export function ProjectInfoEditor(props: {
  locale: string;
  projectId: string;
  initial: ProjectInfoSnapshot;
  labels: {
    projectCode: string;
    projectTitle: string;
    createdAt: string;
    deliveryDeadline: string;
    notes: string;
    notesPlaceholder: string;
    customer: string;
    customerSearchPlaceholder: string;
    customerSearching: string;
    customerNoMatches: string;
    edit: string;
    save: string;
    saving: string;
    cancel: string;
    saved: string;
    errorValidation: string;
    errorDuplicate: string;
    errorGeneric: string;
  };
}) {
  const {labels, initial} = props;
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const [state, formAction, pending] = React.useActionState<UpdateProjectInfoState, FormData>(
    updateProjectInfoAction,
    {},
  );

  const [projectCode, setProjectCode] = React.useState(initial.projectCode);
  const [title, setTitle] = React.useState(initial.title);
  const [deliveryDeadline, setDeliveryDeadline] = React.useState(isoToDateTimeLocal(initial.deliveryDeadline));
  const [notes, setNotes] = React.useState(initial.notes ?? "");

  const [customerId, setCustomerId] = React.useState(initial.customerId);
  const [customerInput, setCustomerInput] = React.useState(initial.customerLabel);
  const [committedLabel, setCommittedLabel] = React.useState<string | null>(initial.customerLabel);
  const [suggestions, setSuggestions] = React.useState<CustomerSearchOption[]>([]);
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [searchHadNoMatch, setSearchHadNoMatch] = React.useState(false);
  const blurTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (state.ok) {
      setLastSavedAt(Date.now());
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  React.useEffect(() => {
    const q = customerInput.trim();
    if (!editing) return;
    if (committedLabel !== null && customerInput === committedLabel) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSearchHadNoMatch(false);
      return;
    }
    if (q.length < 1) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSearchHadNoMatch(false);
      return;
    }

    const id = window.setTimeout(() => {
      void (async () => {
        setSuggestLoading(true);
        setSearchHadNoMatch(false);
        try {
          const rows = await searchActiveCustomersAction(q);
          setSuggestions(rows);
          setSuggestOpen(rows.length > 0);
          setSearchHadNoMatch(rows.length === 0);
        } finally {
          setSuggestLoading(false);
        }
      })();
    }, 280);

    return () => window.clearTimeout(id);
  }, [customerInput, committedLabel, editing]);

  function resetToInitial() {
    setProjectCode(initial.projectCode);
    setTitle(initial.title);
    setDeliveryDeadline(isoToDateTimeLocal(initial.deliveryDeadline));
    setNotes(initial.notes ?? "");
    setCustomerId(initial.customerId);
    setCustomerInput(initial.customerLabel);
    setCommittedLabel(initial.customerLabel);
    setSuggestions([]);
    setSuggestOpen(false);
    setSearchHadNoMatch(false);
  }

  function pickCustomer(c: CustomerSearchOption) {
    const label = formatCustomerLabel(c);
    setCustomerId(c.id);
    setCommittedLabel(label);
    setCustomerInput(label);
    setSuggestions([]);
    setSuggestOpen(false);
    setSearchHadNoMatch(false);
  }

  function onCustomerInputChange(value: string) {
    setCustomerInput(value);
    if (committedLabel !== null && value !== committedLabel) {
      setCommittedLabel(null);
      setCustomerId("");
    }
  }

  const errorText =
    state.errorKey === "validation"
      ? labels.errorValidation
      : state.errorKey === "duplicate"
        ? labels.errorDuplicate
        : state.errorKey
          ? labels.errorGeneric
          : null;

  const canSave = Boolean(customerId.trim());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {lastSavedAt ? <p className="text-xs text-muted-foreground">{labels.saved}</p> : null}
          {errorText ? <p className="text-xs text-destructive">{errorText}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {labels.edit}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetToInitial();
                  setEditing(false);
                }}
                disabled={pending}
              >
                {labels.cancel}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("locale", props.locale);
                  fd.set("project_id", props.projectId);
                  fd.set("project_code", projectCode);
                  fd.set("title", title);
                  fd.set("delivery_deadline", deliveryDeadline);
                  fd.set("customer_id", customerId);
                  fd.set("notes", notes);
                  formAction(fd);
                }}
                disabled={pending || !canSave}
              >
                {pending ? labels.saving : labels.save}
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{labels.projectCode}</dt>
          <dd className="font-medium">
            {!editing ? (
              initial.projectCode
            ) : (
              <div className="w-44">
                <Input value={projectCode} maxLength={50} onChange={(e) => setProjectCode(e.target.value)} />
              </div>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{labels.projectTitle}</dt>
          <dd className="font-medium">
            {!editing ? (
              initial.title
            ) : (
              <div className="w-56">
                <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              </div>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.createdAt}</dt>
          <dd className="font-medium">{formatDateTime(initial.createdAt, props.locale)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{labels.deliveryDeadline}</dt>
          <dd className="font-medium">
            {!editing ? (
              formatDateTime(initial.deliveryDeadline, props.locale)
            ) : (
              <div className="w-52">
                <Input
                  type="datetime-local"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                />
              </div>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{labels.customer}</dt>
          <dd className="min-w-0 font-medium">
            {!editing ? (
              valueOrDash(initial.customerLabel)
            ) : (
              <div className="relative w-56">
                <Input
                  autoComplete="off"
                  placeholder={labels.customerSearchPlaceholder}
                  value={customerInput}
                  aria-autocomplete="list"
                  aria-expanded={suggestOpen}
                  onChange={(e) => onCustomerInputChange(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setSuggestOpen(true);
                  }}
                  onBlur={() => {
                    blurTimer.current = window.setTimeout(() => setSuggestOpen(false), 180);
                  }}
                />
                {suggestLoading ? (
                  <p className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {labels.customerSearching}
                  </p>
                ) : null}
                {suggestOpen && suggestions.length > 0 ? (
                  <ul
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
                  >
                    {suggestions.map((c) => (
                      <li key={c.id} role="option">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (blurTimer.current) window.clearTimeout(blurTimer.current);
                            pickCustomer(c);
                          }}
                        >
                          {formatCustomerLabel(c)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!suggestLoading &&
                customerInput.trim().length > 0 &&
                searchHadNoMatch &&
                suggestions.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{labels.customerNoMatches}</p>
                ) : null}
              </div>
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{labels.notes}</dt>
          <dd className="min-w-0 font-medium">
            {!editing ? (
              <span className="whitespace-pre-wrap">{valueOrDash(initial.notes)}</span>
            ) : (
              <textarea
                rows={3}
                maxLength={5000}
                placeholder={labels.notesPlaceholder}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(
                  "w-56 min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              />
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
