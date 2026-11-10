/**
 * The shop runs on Pakistan time. All dates shown in the app and every "today"
 * use this zone, whatever time zone the PC/browser is set to.
 */
export const STORE_TIME_ZONE = "Asia/Karachi";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: STORE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** e.g. "09/11/2026, 07:45:12 pm" in Pakistan time. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return dateTimeFmt.format(d);
}

/** YYYY-MM-DD of a moment, in Pakistan time. */
export function toStoreYmd(value: string | number | Date): string {
  return ymdFmt.format(value instanceof Date ? value : new Date(value));
}

/** Today's date (YYYY-MM-DD) in Pakistan time. */
export function storeTodayYmd(): string {
  return toStoreYmd(new Date());
}

/** The date `days` days before today (YYYY-MM-DD), Pakistan time. */
export function storeYmdDaysAgo(days: number): string {
  const [y, m, d] = storeTodayYmd().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  return dt.toISOString().slice(0, 10);
}
