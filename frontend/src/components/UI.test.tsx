import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Badge, ErrorMessage, Pagination } from "./UI";
afterEach(cleanup);
it("shows error messages to assistive technology", () => {
  render(<ErrorMessage error={new Error("Insufficient stock")} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Insufficient stock");
});
it("uses readable status text, not color alone", () => {
  render(<Badge>PARTIALLY_RECEIVED</Badge>);
  expect(screen.getByText("PARTIALLY RECEIVED")).toBeInTheDocument();
});
it("prevents paging outside the available result range", () => {
  const change = vi.fn();
  render(<Pagination page={1} count={75} onChange={change} />);
  expect(screen.getByText("Previous")).toBeDisabled();
  fireEvent.click(screen.getByText("Next"));
  expect(change).toHaveBeenCalledWith(2);
});
