import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiaryPreview } from "@/components/diary/DiaryPreview";
import { DiarySession } from "@/components/diary/DiarySession";
import { parseCalendarDate, parseDisplayDate } from "@/lib/dates";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
function Page() {
  const [date, setDate] = useState(parseCalendarDate("2026-10-31")!);
  push.mockImplementation((path: string) => setDate(parseDisplayDate(path.slice("/diary/".length))!));
  return <DiaryPreview key={date} date={date} />;
}
function Home() { return <DiarySession timeZone="Asia/Kolkata"><Page /></DiarySession>; }

it("labels volatile preview writing and temporary artwork without claiming a save", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: /MY LITTLE DIARY/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Diary writing preview" })).toHaveAccessibleDescription(/Preview · not saved.*Server saving and device recovery are reported separately/);
  expect(screen.getByText("Temporary original illustrations")).toBeVisible();
  expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
});

it("preserves the native textarea, content and backward selection through appearance changes", () => {
  render(<Home />);
  const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.input(editor, { target: { value: "Synthetic writing 🌸\nsecond line" } });
  editor.focus();
  editor.setSelectionRange(2, 8, "backward");
  const appearance = screen.getByRole("combobox", { name: "Theme preview" });
  fireEvent.pointerDown(appearance);
  appearance.focus();
  fireEvent.change(appearance, { target: { value: "dreamy-sky" } });
  expect(document.documentElement.dataset.theme).toBe("dreamy-sky");
  expect(screen.getByRole("textbox")).toBe(editor);
  expect(editor).toHaveValue("Synthetic writing 🌸\nsecond line");
  expect(editor).toHaveFocus();
  expect([editor.selectionStart, editor.selectionEnd, editor.selectionDirection]).toEqual([2, 8, "backward"]);
});

it("keeps keyboard focus on the control when appearance was changed outside writing", () => {
  render(<Home />);
  const appearance = screen.getByRole("combobox", { name: "Theme preview" });
  appearance.focus();
  fireEvent.change(appearance, { target: { value: "vintage-journal" } });
  expect(appearance).toHaveFocus();
});

it("does not restore stale writing focus after a different deliberate focus choice", () => {
  render(<Home />);
  screen.getByRole("textbox").focus();
  const appearance = screen.getByRole("combobox", { name: "Theme preview" });
  fireEvent.pointerDown(appearance);
  const today = screen.getByRole("button", { name: /^Today$/ });
  today.focus();
  fireEvent.change(appearance, { target: { value: "dreamy-sky" } });
  expect(today).toHaveFocus();
});

it("isolates text, cleared drafts and selection across date-page remounts", () => {
  render(<Home />);
  const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.input(editor, { target: { value: "Date A 🌸\n  whitespace" } });
  editor.setSelectionRange(2, 6, "backward"); fireEvent.select(editor);
  fireEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(push).toHaveBeenCalledWith("/diary/01/11/2026", { scroll: false });
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "Date B" } });
  for (let index = 0; index < 5; index++) {
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    const a = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(a).toHaveValue("Date A 🌸\n  whitespace");
    expect([a.selectionStart, a.selectionEnd, a.selectionDirection]).toEqual([2, 6, "backward"]);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByRole("textbox")).toHaveValue("Date B");
  }
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
  fireEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it("computes Today on click after midnight without moving an active date", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-12-31T18:29:59Z")); render(<Home />);
    vi.setSystemTime(new Date("2026-12-31T18:30:01Z"));
    expect(screen.getByText("31/10/2026")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Today$/ }));
    expect(push).toHaveBeenLastCalledWith("/diary/01/01/2027", { scroll: false });
  } finally { vi.useRealTimers(); }
});

it("preserves editing focus and selection when Today is already selected", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z")); render(<Home />);
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "A quiet day" } }); editor.focus(); editor.setSelectionRange(2, 6, "backward");
    const today = screen.getByRole("button", { name: /^Today$/ });
    fireEvent.pointerDown(today); today.focus(); fireEvent.click(today);
    expect(editor).toHaveFocus(); expect([editor.selectionStart, editor.selectionEnd, editor.selectionDirection]).toEqual([2, 6, "backward"]);
    expect(push).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
