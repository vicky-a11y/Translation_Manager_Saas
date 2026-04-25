/** 已交稿／結案（與「進行中」互斥統計用） */
export const PROJECT_STATUS_DELIVERED = ["delivered", "completed"] as const;

/** 儀表板「已結案」：交付、完成、取消 */
export const PROJECT_STATUS_CLOSED = ["delivered", "completed", "cancelled"] as const;

/** 儀表板「待交稿」：審稿完成待交付（可依流程擴充狀態） */
export const PROJECT_STATUS_PENDING_DELIVERY = ["review"] as const;

/** PostgREST `.not('status', 'in', ...)` 排除清單：已交稿 + 取消，其餘計入進行中 */
export const PROJECT_STATUS_EXCLUDED_FROM_IN_PROGRESS = [
  "delivered",
  "completed",
  "cancelled",
] as const;

export function excludedFromInProgressForQuery(): string {
  return `(${PROJECT_STATUS_EXCLUDED_FROM_IN_PROGRESS.join(",")})`;
}

/** 「進行中」＝非已結案且非待交稿 */
export function dashboardInProgressExcludedForQuery(): string {
  const set = new Set<string>([
    ...PROJECT_STATUS_CLOSED,
    ...PROJECT_STATUS_PENDING_DELIVERY,
  ]);
  return `(${[...set].join(",")})`;
}
