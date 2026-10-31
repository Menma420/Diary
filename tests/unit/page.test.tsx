import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Home from "@/app/page";

it("labels volatile preview writing and temporary artwork without claiming a save", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: /MY LITTLE DIARY/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Diary writing preview" })).toHaveAccessibleDescription("Preview · not saved");
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
  const today = screen.getByRole("button", { name: "Today" });
  today.focus();
  fireEvent.change(appearance, { target: { value: "dreamy-sky" } });
  expect(today).toHaveFocus();
});

it("presents bounded fixture dates and returns to the reference date", () => {
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: "Next preview date" }));
  expect(screen.getByText("1 November 2026")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next preview date" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByText("31 October 2026")).toBeVisible();
});
