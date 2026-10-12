import { useCallback, useState, type FormEvent } from "react";
import type { PageFeedback } from "./StatusLine";
import { StatusLine } from "./StatusLine";
import { ApiError } from "../lib/apiJson";
import { useVoidSaleMutation } from "../hooks/queries";

type VoidSaleConfirmProps = {
  saleId: number;
  label?: string;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
  onFeedback: (feedback: PageFeedback) => void;
  className?: string;
};

/** Inline confirm before voiding a sale (replaces window.confirm). */
export function VoidSaleConfirm({
  saleId,
  label,
  onCancel,
  onSuccess,
  onFeedback,
  className,
}: VoidSaleConfirmProps) {
  const voidMutation = useVoidSaleMutation();
  const [confirmPassword, setConfirmPassword] = useState("");

  const confirm = async (e?: FormEvent) => {
    e?.preventDefault();
    onFeedback(null);
    if (!confirmPassword.trim()) {
      onFeedback({
        variant: "error",
        message: "Enter your password to confirm void.",
      });
      return;
    }
    try {
      await voidMutation.mutateAsync({ saleId, confirmPassword });
      onFeedback({
        variant: "success",
        message: label
          ? `Sale ${label} voided. Stock restored.`
          : "Sale voided. Stock restored.",
      });
      await onSuccess();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Failed to void sale";
      onFeedback({ variant: "error", message });
    }
  };

  const busy = voidMutation.isPending;
  const extra = className ? ` ${className}` : "";

  return (
    <form
      className={`confirm-line${extra}`}
      role="group"
      aria-label="Confirm void sale"
      onSubmit={confirm}
    >
      <p className="confirm-line-text">
        Void this sale? Stock will be restored. Re-enter your password to confirm.
        {label ? <strong> {label}</strong> : null}
      </p>
      <label className="void-password-field">
        <span className="lab">Your password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />
      </label>
      <div className="confirm-line-actions">
        <button
          type="submit"
          className="btn btn-danger btn-sm"
          disabled={busy}
        >
          {busy ? "Voiding…" : "Yes, void sale"}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Pending void id + shared feedback for list / invoice pages. */
export function useVoidSaleFlow() {
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<PageFeedback>(null);

  const requestVoid = useCallback((saleId: number) => {
    setFeedback(null);
    setPendingVoidId(saleId);
  }, []);

  const cancelVoid = useCallback(() => {
    setPendingVoidId(null);
  }, []);

  return {
    pendingVoidId,
    feedback,
    setFeedback,
    requestVoid,
    cancelVoid,
  };
}

export function VoidSaleFeedback({
  feedback,
  className,
}: {
  feedback: PageFeedback;
  className?: string;
}) {
  if (!feedback) return null;
  return (
    <StatusLine variant={feedback.variant} className={className}>
      {feedback.message}
    </StatusLine>
  );
}
