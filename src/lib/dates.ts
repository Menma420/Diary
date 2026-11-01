// Calendar values only: arithmetic never passes through browser-local timestamps.
export type CalendarDate = string & { readonly calendarDate: unique symbol };
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export const MIN_DATE = "0001-01-01" as CalendarDate;
export const MAX_DATE = "9999-12-31" as CalendarDate;
export const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
export function daysInMonth(year: number, month: number) {
  return month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function parseCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? value as CalendarDate : null;
}
export function parts(date: CalendarDate): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}
export function calendarDate(year: number, month: number, day: number): CalendarDate {
  const date = parseCalendarDate(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (!date) throw new RangeError("Invalid calendar date");
  return date;
}
export function addDays(date: CalendarDate, offset: number): CalendarDate | null {
  if (!Number.isInteger(offset) || Math.abs(offset) > 366) throw new RangeError("Unsupported calendar-day offset");
  let [year, month, day] = parts(date);
  day += offset;
  while (day > daysInMonth(year, month)) { day -= daysInMonth(year, month); if (++month > 12) { month = 1; year++; } }
  while (day < 1) { if (--month < 1) { month = 12; year--; } day += daysInMonth(year, month); }
  return year >= 1 && year <= 9999 ? calendarDate(year, month, day) : null;
}
export function addMonths(date: CalendarDate, offset: number): CalendarDate | null {
  const [year, month, day] = parts(date);
  const index = (year - 1) * 12 + month - 1 + offset;
  if (!Number.isInteger(index) || index < 0 || index >= 9999 * 12) return null;
  const nextYear = Math.floor(index / 12) + 1;
  const nextMonth = index % 12 + 1;
  return calendarDate(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
}
export function weekday(date: CalendarDate) {
  const [year, month, day] = parts(date);
  const previous = year - 1;
  let days = previous * 365 + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400) + day;
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days % 7; // Gregorian 0001-01-01 is Monday; Sunday is zero.
}
export function formatDate(date: CalendarDate) {
  const [year, month, day] = parts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
}
export function parseDisplayDate(value: string): CalendarDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? parseCalendarDate(`${match[3]}-${match[2]}-${match[1]}`) : null;
}
export function today(timeZone: string, now = new Date()): CalendarDate {
  const values = new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => values.find((part) => part.type === type)!.value;
  return calendarDate(Number(value("year")), Number(value("month")), Number(value("day")));
}
export type DateRouteParams = { day: string; month: string; year: string };
export const dateFromRoute = ({ day, month, year }: DateRouteParams) => parseDisplayDate(`${day}/${month}/${year}`);
export const diaryPath = (date: CalendarDate) => `/diary/${formatDate(date)}`;
