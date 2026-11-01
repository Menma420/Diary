import { describe, expect, it } from "vitest";
import { addDays, addMonths, calendarDate, dateFromRoute, diaryPath, formatDate, isLeapYear, MAX_DATE, MIN_DATE, parseCalendarDate, parseDisplayDate, today, weekday } from "@/lib/dates";

describe("strict calendar dates", () => {
  it.each(["2026-10-31", "2024-02-29", "2000-02-29", "0001-01-01", "0099-12-31", "9999-12-31"])("accepts %s", (value) => expect(parseCalendarDate(value)).toBe(value));
  it.each(["", "2026-2-01", "26-02-01", "0000-01-01", "10000-01-01", "2026-02-29", "1900-02-29", "2100-02-29", "2024-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-01-32", "2026-10-31T00:00:00Z", " 2026-10-31", "２０２６-１０-３１", null, undefined])("rejects %s without normalization", (value) => expect(parseCalendarDate(value)).toBeNull());
  it("uses DD/MM/YYYY for presentation, strict input and URLs", () => {
    expect(formatDate(calendarDate(2026, 1, 2))).toBe("02/01/2026");
    expect(formatDate(calendarDate(99, 1, 2))).toBe("02/01/0099");
    expect(parseDisplayDate("29/02/2024")).toBe("2024-02-29");
    for (const invalid of ["29/02/2026", "2/1/2026", "01/13/2026", "2026-01-02"]) expect(parseDisplayDate(invalid)).toBeNull();
    expect(diaryPath(calendarDate(1, 1, 1))).toBe("/diary/01/01/0001");
    expect(dateFromRoute({ day: "02", month: "01", year: "0099" })).toBe("0099-01-02");
    expect(dateFromRoute({ day: "2", month: "01", year: "0099" })).toBeNull();
    expect(dateFromRoute({ day: "29", month: "02", year: "1900" })).toBeNull();
  });
});
describe("calendar arithmetic", () => {
  it.each([
    ["2026-10-30", "2026-10-31"], ["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"],
    ["2024-02-28", "2024-02-29"], ["2024-02-29", "2024-03-01"], ["2026-02-28", "2026-03-01"],
    ["1900-02-28", "1900-03-01"], ["2000-02-28", "2000-02-29"], ["2100-02-28", "2100-03-01"],
    ["0099-12-31", "0100-01-01"], ["0004-02-28", "0004-02-29"], ["2026-03-08", "2026-03-09"], ["2026-11-01", "2026-11-02"],
  ])("moves from %s to %s and back", (a, b) => { expect(addDays(parseCalendarDate(a)!, 1)).toBe(b); expect(addDays(parseCalendarDate(b)!, -1)).toBe(a); });
  it("handles bounds, clamped month jumps and early-year weekdays", () => {
    expect(addDays(MIN_DATE, -1)).toBeNull(); expect(addDays(MAX_DATE, 1)).toBeNull();
    expect(addMonths(MIN_DATE, -1)).toBeNull(); expect(addMonths(MAX_DATE, 1)).toBeNull();
    expect(addMonths(calendarDate(2024, 1, 31), 1)).toBe("2024-02-29");
    expect(addMonths(calendarDate(2024, 2, 29), 12)).toBe("2025-02-28");
    expect(weekday(MIN_DATE)).toBe(1); expect(weekday(calendarDate(2026, 10, 31))).toBe(6);
    expect(isLeapYear(2000)).toBe(true); expect(isLeapYear(1900)).toBe(false);
    expect(() => calendarDate(2026, 2, 29)).toThrow(RangeError);
  });
});
describe("timezone-aware Today", () => {
  it.each([
    ["2026-10-31T18:29:59Z", "Asia/Kolkata", "2026-10-31"], ["2026-10-31T18:30:00Z", "Asia/Kolkata", "2026-11-01"],
    ["2026-12-31T18:30:00Z", "Asia/Kolkata", "2027-01-01"], ["2024-02-28T18:30:00Z", "Asia/Kolkata", "2024-02-29"],
    ["2026-03-08T09:59:59Z", "America/Los_Angeles", "2026-03-08"], ["2026-03-08T10:00:00Z", "America/Los_Angeles", "2026-03-08"],
    ["2026-10-31T10:30:00Z", "Pacific/Kiritimati", "2026-11-01"], ["2026-10-31T00:30:00Z", "America/Los_Angeles", "2026-10-30"],
  ])("formats %s in %s as %s", (instant, zone, date) => expect(today(zone, new Date(instant))).toBe(date));
});
