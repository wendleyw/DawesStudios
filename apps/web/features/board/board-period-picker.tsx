"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const quarters = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

export function BoardPeriodPicker({
  value,
  years,
  onChange,
}: {
  value: string;
  years: number[];
  onChange: (period: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const yearIndex = years.indexOf(year);
  const label = value ? `${value.slice(5)} ${value.slice(0, 4)}` : "All periods";

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(period: string) {
    onChange(period);
    close();
  }

  return (
    <div
      className="board-period-picker"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        type="button"
        className="board-period-trigger"
        ref={trigger}
        aria-label={`Board period: ${label}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) setYear(Number(value.slice(0, 4)) || new Date().getUTCFullYear());
          setOpen(!open);
        }}
      >
        <span className="board-period-label">{label}</span>
        <span className="board-period-short-label" aria-hidden="true">
          {value ? value.slice(5) : "All"}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          ref={panel}
          className="board-period-panel"
          role="region"
          aria-label="Choose a board period"
        >
          <div className="board-period-year">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous year"
              aria-disabled={yearIndex <= 0}
              onClick={() => {
                if (yearIndex > 0) setYear(years[yearIndex - 1]);
              }}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong aria-live="polite">{year}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Next year"
              aria-disabled={yearIndex < 0 || yearIndex >= years.length - 1}
              onClick={() => {
                if (yearIndex >= 0 && yearIndex < years.length - 1) setYear(years[yearIndex + 1]);
              }}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="board-period-quarters">
            {quarters.map((months, index) => {
              const quarter = `Q${index + 1}`;
              const period = `${year}-${quarter}`;
              return (
                <button
                  key={quarter}
                  type="button"
                  aria-label={`${quarter} ${year}`}
                  aria-pressed={value === period}
                  onClick={() => choose(period)}
                >
                  <strong>{quarter}</strong>
                  <small aria-hidden="true">{months}</small>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="board-period-all"
            aria-pressed={!value}
            onClick={() => choose("")}
          >
            All periods
          </button>
          <p>Based on project dates. Undated projects stay visible.</p>
        </div>
      )}
    </div>
  );
}
