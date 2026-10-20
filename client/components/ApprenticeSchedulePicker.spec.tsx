/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ApprenticeSchedulePicker from "./ApprenticeSchedulePicker";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const morning = new Date("2026-10-20T13:00:00.000Z");

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderPicker(onChange: (next: { date: string; time: string }) => void, durationMinutes = 60) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const state = { date: "", time: "" };
  const draw = () => {
    act(() => {
      root?.render(
        <ApprenticeSchedulePicker
          date={state.date}
          time={state.time}
          durationMinutes={durationMinutes}
          now={morning}
          onChange={(next) => {
            state.date = next.date;
            state.time = next.time;
            onChange(next);
            draw();
          }}
        />,
      );
    });
  };
  draw();
  return host;
}

describe("apprentice date and time chooser", () => {
  it("closes Sunday and stops Saturday before noon", () => {
    const changes: Array<{ date: string; time: string }> = [];
    const host = renderPicker((next) => changes.push(next), 60);
    const sunday = host.querySelector("[data-testid='re75-day-2026-10-25']") as HTMLButtonElement;
    const saturday = host.querySelector("[data-testid='re75-day-2026-10-24']") as HTMLButtonElement;
    expect(sunday.disabled).toBe(true);
    expect(saturday.disabled).toBe(false);
    act(() => {
      saturday.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const times = [...host.querySelectorAll("[data-testid^='re75-time-']")]
      .filter((node) => node.getAttribute("data-testid") !== "re75-time-list")
      .map((node) => node.textContent);
    expect(times).toEqual(["9:00 AM", "10:00 AM", "11:00 AM"]);
    expect(times).not.toContain("12:00 PM");
    const calendar = host.querySelector("[data-testid='re75-day-2026-10-24']")?.getBoundingClientRect();
    const list = host.querySelector("[data-testid='re75-time-list']")?.getBoundingClientRect();
    expect(list && calendar ? list.top >= calendar.bottom : true).toBe(true);
    act(() => {
      host.querySelector("[data-testid='re75-time-10:00 AM']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(changes[changes.length - 1]).toEqual({ date: "2026-10-24", time: "10:00 AM" });
  });

  it("leaves the regular booking form on live availability", () => {
    const page = readFileSync(resolve("client/pages/RealEstate75.tsx"), "utf8");
    const booking = readFileSync(resolve("client/components/BookingForm.tsx"), "utf8");
    expect(page).not.toContain("/api/bookings/realestate-75/slots");
    expect(page).not.toContain("photographerName");
    expect(page).not.toContain("<Header");
    expect(page).not.toContain("<Footer");
    expect(booking).toContain("BookingSlotPicker");
    expect(booking).toContain("/api/bookings/slots?");
  });
});
