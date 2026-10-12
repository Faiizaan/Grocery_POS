import type { ReactNode } from "react";

export type StatusVariant = "success" | "error";

type StatusLineProps = {
  variant: StatusVariant;
  children: ReactNode;
  className?: string;
};

/** Inline success (green) or error (red) banner for page feedback. */
export function StatusLine({ variant, children, className }: StatusLineProps) {
  if (children == null || children === "") return null;
  const extra = className ? ` ${className}` : "";
  return (
    <div
      role="alert"
      className={`status-line status-line--${variant}${extra}`}
    >
      {children}
    </div>
  );
}

export type PageFeedback = {
  variant: StatusVariant;
  message: string;
} | null;
