const MONEY_SCALE = 100;

export type BalanceValidationInput = {
  totalAmount: number;
  paidAmount: number;
};

export type BalanceValidationResult =
  | {
      ok: true;
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
      overpaidAmount: 0;
    }
  | {
      ok: false;
      code: "NEGATIVE_TOTAL" | "NEGATIVE_PAID" | "OVERPAID";
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
      overpaidAmount: number;
    };

function toMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

/**
 * V1.0 平衡校驗：
 * 1) remaining 一律系統計算（total - paid）
 * 2) 不允許 paid > total（若要收溢收款，改走預付款流程）
 */
export function validatePaymentBalance(input: BalanceValidationInput): BalanceValidationResult {
  const totalAmount = toMoney(input.totalAmount);
  const paidAmount = toMoney(input.paidAmount);

  if (totalAmount < 0) {
    return {
      ok: false,
      code: "NEGATIVE_TOTAL",
      totalAmount,
      paidAmount,
      remainingAmount: toMoney(totalAmount - paidAmount),
      overpaidAmount: 0,
    };
  }

  if (paidAmount < 0) {
    return {
      ok: false,
      code: "NEGATIVE_PAID",
      totalAmount,
      paidAmount,
      remainingAmount: toMoney(totalAmount - paidAmount),
      overpaidAmount: 0,
    };
  }

  if (paidAmount > totalAmount) {
    const overpaidAmount = toMoney(paidAmount - totalAmount);
    return {
      ok: false,
      code: "OVERPAID",
      totalAmount,
      paidAmount,
      remainingAmount: 0,
      overpaidAmount,
    };
  }

  return {
    ok: true,
    totalAmount,
    paidAmount,
    remainingAmount: toMoney(totalAmount - paidAmount),
    overpaidAmount: 0,
  };
}

