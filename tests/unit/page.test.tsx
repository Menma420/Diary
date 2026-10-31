import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Home from "@/app/page";

it("identifies the foundation without offering editing or claiming a save", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "Dear Diary" })).toBeVisible();
  expect(screen.getByText(/Phase 2, after review/)).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
});
