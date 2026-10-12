/** Arrow Up/Down on number inputs changes value by 1 (not by fractional step). */
export function installNumberInputArrowStep() {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "number") return;
    if (el.readOnly || el.disabled) return;

    e.preventDefault();

    const min = el.min !== "" ? parseFloat(el.min) : Number.NEGATIVE_INFINITY;
    const max = el.max !== "" ? parseFloat(el.max) : Number.POSITIVE_INFINITY;
    const raw = el.value.trim();
    const current = raw === "" ? 0 : parseFloat(raw);
    if (!Number.isFinite(current)) return;

    const delta = e.key === "ArrowUp" ? 1 : -1;
    let next = current + delta;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);

    const str = String(next);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter) setter.call(el, str);
    else el.value = str;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
