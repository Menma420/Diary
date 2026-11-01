import { afterEach, expect, it, vi } from "vitest";
import TodayPage from "@/app/diary/page";
import RootPage from "@/app/page";
import DiaryPage from "@/app/diary/[day]/[month]/[year]/page";

const { redirect, notFound } = vi.hoisted(() => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }), notFound: vi.fn(() => { throw new Error("not-found"); }) }));
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/env.server", () => ({ getServerEnvironment: () => ({ DEFAULT_TIMEZONE: "Asia/Kolkata" }) }));
afterEach(() => vi.useRealTimers());

it("both index routes compute request-time Today from configured timezone", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-31T18:29:59Z"));
  expect(() => TodayPage()).toThrow("redirect:/diary/31/12/2026");
  vi.setSystemTime(new Date("2026-12-31T18:30:00Z"));
  expect(() => RootPage()).toThrow("redirect:/diary/01/01/2027");
});
it("the date page passes its exact validated URL date to the diary", async () => {
  const page = await DiaryPage({ params: Promise.resolve({ day: "29", month: "02", year: "0004" }) });
  expect(page.props.date).toBe("0004-02-29"); expect(notFound).not.toHaveBeenCalled();
});
it.each(["29/02/2026", "01/1/2026", "29/02/1900", "01/01/0000", "tomorrow/02/2026"])("the date page rejects %s instead of opening an empty draft", async (date) => {
  const [day, month, year] = date.split("/") as [string, string, string];
  await expect(DiaryPage({ params: Promise.resolve({ day, month, year }) })).rejects.toThrow("not-found");
});
