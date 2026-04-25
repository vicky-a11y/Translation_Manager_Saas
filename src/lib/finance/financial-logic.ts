const TAX_RATE_BASE = 100;

export const PAYMENT_METHOD = {
  CASH: 1,
  BANK_TRANSFER: 2,
  ONLINE_CARD: 3,
  OTHER: 4,
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export type FinancialInput = {
  totalAmount: number;
  disbursementFee: number;
  paidAmount: number;
  paymentMethod?: number | null;
  taxRatePercent?: number; // 預設 5（營業稅）
};

export type FinancialBreakdown = {
  taxRatePercent: number;
  taxableTotal: number;
  disbursementFee: number;
  totalAmount: number;
  subtotal: number; // 未稅金額
  tax: number; // 稅金
  paidAmount: number;
  remainingAmount: number;
};

export type FinancialValidationResult =
  | {ok: true; breakdown: FinancialBreakdown}
  | {
      ok: false;
      code:
        | "NEGATIVE_INPUT"
        | "OVERPAID"
        | "INVALID_TAX_RATE"
        | "DISBURSEMENT_OVER_TOTAL"
        | "PAYMENT_METHOD_REQUIRED"
        | "PAYMENT_METHOD_INVALID";
      message: string;
      breakdown: FinancialBreakdown;
      overpaidAmount: number;
    };

function toIntMoney(value: number): number {
  // V1.0 以元為單位，所有內部計算統一成整數，避免浮點誤差。
  return Math.round(value);
}

function computeSubtotal(taxableTotal: number, taxRatePercent: number): number {
  const divisor = 1 + taxRatePercent / TAX_RATE_BASE;
  // 規格：Taxable_Total ÷ (1 + taxRate) 後四捨五入至整數。
  return Math.round(taxableTotal / divisor);
}

export function computeFinancialBreakdown(input: FinancialInput): FinancialBreakdown {
  const taxRatePercent = input.taxRatePercent ?? 5;

  const totalAmount = toIntMoney(input.totalAmount);
  const disbursementFee = toIntMoney(input.disbursementFee);
  const paidAmount = toIntMoney(input.paidAmount);

  const taxableTotal = totalAmount - disbursementFee;
  const subtotal = computeSubtotal(taxableTotal, taxRatePercent);
  const tax = taxableTotal - subtotal;
  const remainingAmount = totalAmount - paidAmount;

  return {
    taxRatePercent,
    taxableTotal,
    disbursementFee,
    totalAmount,
    subtotal,
    tax,
    paidAmount,
    remainingAmount,
  };
}

export function validateFinancialInput(input: FinancialInput): FinancialValidationResult {
  const breakdown = computeFinancialBreakdown(input);
  const paymentMethod = input.paymentMethod ?? null;

  if (breakdown.taxRatePercent < 0) {
    return {
      ok: false,
      code: "INVALID_TAX_RATE",
      message: "稅率不得為負數。",
      breakdown,
      overpaidAmount: 0,
    };
  }

  if (breakdown.totalAmount < 0 || breakdown.disbursementFee < 0 || breakdown.paidAmount < 0) {
    return {
      ok: false,
      code: "NEGATIVE_INPUT",
      message: "金額不得為負數。",
      breakdown,
      overpaidAmount: 0,
    };
  }

  if (breakdown.disbursementFee > breakdown.totalAmount) {
    return {
      ok: false,
      code: "DISBURSEMENT_OVER_TOTAL",
      message: "規費不可大於總金額。",
      breakdown,
      overpaidAmount: 0,
    };
  }

  if (breakdown.paidAmount > breakdown.totalAmount) {
    return {
      ok: false,
      code: "OVERPAID",
      message: "已付金額超過總金額，請確認是否轉入客戶預付款。",
      breakdown: {
        ...breakdown,
        remainingAmount: 0,
      },
      overpaidAmount: breakdown.paidAmount - breakdown.totalAmount,
    };
  }

  if (breakdown.paidAmount > 0 && paymentMethod == null) {
    return {
      ok: false,
      code: "PAYMENT_METHOD_REQUIRED",
      message: "已收款大於 0 時，必須選擇付款方式。",
      breakdown,
      overpaidAmount: 0,
    };
  }

  if (paymentMethod != null && ![1, 2, 3, 4].includes(paymentMethod)) {
    return {
      ok: false,
      code: "PAYMENT_METHOD_INVALID",
      message: "付款方式不合法。",
      breakdown,
      overpaidAmount: 0,
    };
  }

  return {ok: true, breakdown};
}

export function isBalanceValid(paidAmount: number, remainingAmount: number, totalAmount: number): boolean {
  return toIntMoney(paidAmount) + toIntMoney(remainingAmount) === toIntMoney(totalAmount);
}

export function canCloseProject(remainingAmount: number): boolean {
  return toIntMoney(remainingAmount) === 0;
}

export function canIssueInvoicePreview(input: {
  subtotal: number;
  tax: number;
  disbursementFee: number;
  totalAmount: number;
}): boolean {
  const subtotal = toIntMoney(input.subtotal);
  const tax = toIntMoney(input.tax);
  const disbursementFee = toIntMoney(input.disbursementFee);
  const totalAmount = toIntMoney(input.totalAmount);
  return subtotal + tax + disbursementFee === totalAmount;
}

export type TotalAmountChangeInput = {
  previousTotalAmount: number;
  newTotalAmount: number;
  paidAmount: number;
  hasIssuedInvoice: boolean;
};

export type TotalAmountChangeResult = {
  previousTotalAmount: number;
  newTotalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  requiresInvoiceReview: boolean;
  warningMessage: string | null;
};

/**
 * 總金額變動專用邏輯：
 * - 變更總額後，待支付金額永遠依公式自動重算。
 * - 若案件已開過發票且總額異動，回傳提醒訊息供 UI 顯示。
 */
export function handleTotalAmountChange(input: TotalAmountChangeInput): TotalAmountChangeResult {
  const previousTotalAmount = toIntMoney(input.previousTotalAmount);
  const newTotalAmount = toIntMoney(input.newTotalAmount);
  const paidAmount = toIntMoney(input.paidAmount);
  const remainingAmount = toIntMoney(newTotalAmount - paidAmount);

  const totalChanged = previousTotalAmount !== newTotalAmount;
  const requiresInvoiceReview = input.hasIssuedInvoice && totalChanged;

  return {
    previousTotalAmount,
    newTotalAmount,
    paidAmount,
    remainingAmount,
    requiresInvoiceReview,
    warningMessage: requiresInvoiceReview
      ? "總金額已變動，請注意原始發票是否需要作廢重開。"
      : null,
  };
}

