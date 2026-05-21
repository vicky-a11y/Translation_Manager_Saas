"use client";

import * as React from "react";

import {updateProjectFinanceAction, type UpdateProjectFinanceState} from "./actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

type FinanceSnapshot = {
  amount: number | null;
  disbursementFee: number | null;
  taxableTotal: number | null;
  subtotal: number | null;
  tax: number | null;
  paidAmount: number | null;
  remainingAmount: number | null;
  paymentMethod: number | null;
  remittanceBankName: string | null;
  remittanceAccountLast5: string | null;
  remittanceIsCounter: boolean | null;
  paymentNote: string | null;
};

function localeToBcp47(locale: string) {
  return locale === "zh-TW" || locale === "zh-CN" ? locale : locale === "ms" ? "ms-MY" : "en-US";
}

function formatMoney(value: unknown, locale: string) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  const tag = localeToBcp47(locale);
  try {
    return new Intl.NumberFormat(tag, {maximumFractionDigits: 0}).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return String(Number.isFinite(amount) ? amount : 0);
  }
}

function toInputMoney(value: number | null) {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function moneyFromInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return "";
  const n = Number(normalized);
  if (!Number.isFinite(n)) return value;
  return String(Math.round(n));
}

export function ProjectFinanceEditor(props: {
  locale: string;
  projectId: string;
  labels: {
    amount: string;
    disbursementFee: string;
    taxableTotal: string;
    subtotal: string;
    tax: string;
    receivedAmount: string;
    unreceivedAmount: string;
    paymentMethod: string;
    paymentMethodUnset: string;
    paymentMethodCash: string;
    paymentMethodTransfer: string;
    paymentMethodOverseasWire: string;
    paymentMethodCard: string;
    paymentMethodOther: string;
    remittanceBankName: string;
    remittanceAccountLast5: string;
    remittanceCounter: string;
    paymentNote: string;
    edit: string;
    save: string;
    saving: string;
    cancel: string;
    saved: string;
    errorValidation: string;
    errorGeneric: string;
  };
  initial: FinanceSnapshot;
}) {
  const {labels} = props;
  const [editing, setEditing] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const [state, formAction, pending] = React.useActionState<UpdateProjectFinanceState, FormData>(
    updateProjectFinanceAction,
    {},
  );

  const [paymentMethod, setPaymentMethod] = React.useState<string>(props.initial.paymentMethod?.toString() ?? "");
  const [paidAmount, setPaidAmount] = React.useState<string>(toInputMoney(props.initial.paidAmount));
  const [bankName, setBankName] = React.useState<string>(props.initial.remittanceBankName ?? "");
  const [last5, setLast5] = React.useState<string>(props.initial.remittanceAccountLast5 ?? "");
  const [isCounter, setIsCounter] = React.useState<boolean>(Boolean(props.initial.remittanceIsCounter));
  const [note, setNote] = React.useState<string>(props.initial.paymentNote ?? "");

  React.useEffect(() => {
    if (state.ok) {
      setLastSavedAt(Date.now());
      setEditing(false);
    }
  }, [state.ok]);

  function resetToInitial() {
    setPaymentMethod(props.initial.paymentMethod?.toString() ?? "");
    setPaidAmount(toInputMoney(props.initial.paidAmount));
    setBankName(props.initial.remittanceBankName ?? "");
    setLast5(props.initial.remittanceAccountLast5 ?? "");
    setIsCounter(Boolean(props.initial.remittanceIsCounter));
    setNote(props.initial.paymentNote ?? "");
  }

  const showTransferFields = paymentMethod === "2";
  const showOtherFields = paymentMethod === "4";

  const errorText =
    state.errorKey === "validation"
      ? labels.errorValidation
      : state.errorKey
        ? labels.errorGeneric
        : null;

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
                  fd.set("paid_amount", paidAmount);
                  if (paymentMethod) fd.set("payment_method", paymentMethod);
                  if (showTransferFields) {
                    fd.set("remittance_bank_name", bankName);
                    fd.set("remittance_account_last5", last5);
                    fd.set("remittance_is_counter", isCounter ? "true" : "false");
                  }
                  if (showOtherFields) fd.set("payment_note", note);
                  formAction(fd);
                }}
                disabled={pending}
              >
                {pending ? labels.saving : labels.save}
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.amount}</dt>
          <dd className="font-medium">{formatMoney(props.initial.amount, props.locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.disbursementFee}</dt>
          <dd className="font-medium">{formatMoney(props.initial.disbursementFee, props.locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.taxableTotal}</dt>
          <dd className="font-medium">{formatMoney(props.initial.taxableTotal, props.locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.subtotal}</dt>
          <dd className="font-medium">{formatMoney(props.initial.subtotal, props.locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.tax}</dt>
          <dd className="font-medium">{formatMoney(props.initial.tax, props.locale)}</dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{labels.receivedAmount}</dt>
          <dd className="font-medium">
            {!editing ? (
              formatMoney(props.initial.paidAmount, props.locale)
            ) : (
              <div className="w-44">
                <Input value={paidAmount} inputMode="numeric" onChange={(e) => setPaidAmount(moneyFromInput(e.target.value))} />
              </div>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{labels.unreceivedAmount}</dt>
          <dd className={cn("font-medium", (props.initial.remainingAmount ?? 0) > 0 ? "text-foreground" : "text-emerald-700")}>
            {formatMoney(props.initial.remainingAmount, props.locale)}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{labels.paymentMethod}</dt>
          <dd className="font-medium">
            {!editing ? (
              <span className="text-muted-foreground">
                {props.initial.paymentMethod == null
                  ? labels.paymentMethodUnset
                  : props.initial.paymentMethod === 1
                    ? labels.paymentMethodCash
                    : props.initial.paymentMethod === 2
                      ? labels.paymentMethodTransfer
                      : props.initial.paymentMethod === 3
                        ? labels.paymentMethodCard
                        : props.initial.paymentMethod === 5
                          ? labels.paymentMethodOverseasWire
                          : labels.paymentMethodOther}
              </span>
            ) : (
              <select
                className="h-8 w-44 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">{labels.paymentMethodUnset}</option>
                <option value="1">{labels.paymentMethodCash}</option>
                <option value="2">{labels.paymentMethodTransfer}</option>
                <option value="5">{labels.paymentMethodOverseasWire}</option>
                <option value="3">{labels.paymentMethodCard}</option>
                <option value="4">{labels.paymentMethodOther}</option>
              </select>
            )}
          </dd>
        </div>

        {editing && showTransferFields ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{labels.remittanceBankName}</dt>
              <dd className="font-medium">
                <div className="w-44">
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{labels.remittanceAccountLast5}</dt>
              <dd className="font-medium">
                <div className="w-44">
                  <Input value={last5} inputMode="numeric" onChange={(e) => setLast5(e.target.value.replace(/\s+/g, ""))} />
                </div>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{labels.remittanceCounter}</dt>
              <dd className="font-medium">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-foreground"
                    checked={isCounter}
                    onChange={(e) => setIsCounter(e.target.checked)}
                  />
                  {labels.remittanceCounter}
                </label>
              </dd>
            </div>
          </>
        ) : null}

        {editing && showOtherFields ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{labels.paymentNote}</dt>
            <dd className="font-medium">
              <div className="w-44">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

