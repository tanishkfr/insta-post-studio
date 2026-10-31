import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Landing } from "./Landing";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not restart sound after leaving while audio is starting", async () => {
  let finishResume!: () => void;
  const resume = new Promise<void>((resolve) => { finishResume = resolve; });
  const context = { state: "suspended", resume: () => resume, close: vi.fn(async () => {}) };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  const intervals = vi.spyOn(window, "setInterval");
  const view = render(<Landing onEnter={() => {}} onOpenTool={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "Sound off" }));
  view.unmount();
  await act(async () => { finishResume(); await resume; });

  expect(context.close).toHaveBeenCalledOnce();
  expect(intervals).not.toHaveBeenCalled();
});

it("releases the context when audio startup fails", async () => {
  const context = { resume: vi.fn().mockRejectedValue(new Error("audio unavailable")), close: vi.fn(async () => {}) };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  const intervals = vi.spyOn(window, "setInterval");
  render(<Landing onEnter={() => {}} onOpenTool={() => {}} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sound off" })); });

  expect(context.close).toHaveBeenCalledOnce();
  expect(intervals).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute("aria-pressed", "false");
});

it("does not start sound after it is switched off during startup", async () => {
  let finishResume!: () => void;
  const resume = new Promise<void>((resolve) => { finishResume = resolve; });
  const context = { state: "suspended", resume: () => resume, close: vi.fn(async () => {}) };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  const intervals = vi.spyOn(window, "setInterval");
  render(<Landing onEnter={() => {}} onOpenTool={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "Sound off" }));
  fireEvent.click(screen.getByRole("button", { name: "Sound off" }));
  await act(async () => { finishResume(); await resume; });

  expect(context.close).toHaveBeenCalledOnce();
  expect(intervals).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute("aria-pressed", "false");
});
