"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg font-semibold active:brightness-95 disabled:opacity-40 disabled:active:brightness-100",
  secondary: "bg-surface-2 text-fg border border-line active:bg-surface disabled:opacity-40",
  ghost: "bg-transparent text-muted active:text-fg disabled:opacity-40",
  danger: "bg-transparent text-danger border border-danger/40 active:bg-danger/10",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-14 text-lg px-6" : size === "sm" ? "h-9 text-sm px-3" : "h-12 text-base px-5";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl transition-[filter,background-color] select-none ${sz} ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Chip({
  selected,
  color = "accent",
  children,
  onClick,
}: {
  selected: boolean;
  color?: "accent" | "me";
  children: ReactNode;
  onClick?: () => void;
}) {
  const on = color === "me" ? "bg-me/15 border-me text-me" : "bg-accent/15 border-accent text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 px-4 rounded-full border text-base font-medium transition-colors ${
        selected ? on : "border-line bg-surface text-fg active:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr rounded-2xl bg-surface p-1 border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-xl text-sm font-medium transition-colors ${
            o.value === value ? "bg-surface-2 text-fg shadow" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 py-3 text-left"
    >
      <span>
        <span className="block text-base">{label}</span>
        {hint && <span className="block text-sm text-muted mt-0.5">{hint}</span>}
      </span>
      <span
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted tracking-wide">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
