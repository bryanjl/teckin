/** Shared class names for the host dashboard and question set editor (56 px touch targets). */
const focusRing =
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** A secondary button. */
export const buttonClass = `min-h-touch rounded-2xl border-2 border-ink-muted/40 bg-surface-raised px-5 text-lg font-semibold text-ink disabled:opacity-40 ${focusRing}`;

/** The main action on a screen. */
export const primaryButtonClass = `min-h-touch rounded-2xl bg-accent px-6 text-lg font-bold text-accent-ink disabled:opacity-40 ${focusRing}`;

/** A button that deletes something. */
export const dangerButtonClass = `min-h-touch rounded-2xl border-2 border-danger px-5 text-lg font-semibold text-danger ${focusRing}`;

/** A square icon-sized button that still meets the touch target. */
export const iconButtonClass = `min-h-touch min-w-touch rounded-2xl border-2 border-ink-muted/30 bg-surface px-3 text-lg font-semibold text-ink disabled:opacity-30 ${focusRing}`;

/** Text inputs and text areas. */
export const inputClass =
  'min-h-touch w-full rounded-2xl border-2 border-ink-muted/40 bg-surface px-4 text-lg text-ink outline-none focus:border-accent aria-invalid:border-danger';
