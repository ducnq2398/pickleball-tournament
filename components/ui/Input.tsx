"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const BASE =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-strong placeholder:text-faint " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-body">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-mute">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-live-400">{error}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(BASE, className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(BASE, "appearance-none pr-8", className)}>
      {children}
    </select>
  );
}

export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="number"
      inputMode="numeric"
      className={cn(BASE, "tabular text-center", className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-medium text-strong">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-mute">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-fill-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
