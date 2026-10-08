/** Options for {@link createAutopilotAnswerer}. */
export interface AutopilotAnswererOptions {
  document: Document;
  /** Debug-only oracle from the shell. */
  correctOptionFor: (questionId: string) => string;
  energy: () => number;
  /** Keep answering until energy reaches this, then close the sheet. */
  refillTo: number;
  /** Ask for energy below this (default 40: a jump, a double jump and some walking). */
  askBelow?: number;
}

/** Handle returned by {@link createAutopilotAnswerer}. */
export interface AutopilotAnswerer {
  /** True when the autopilot should stop and get energy. */
  needsEnergy: () => boolean;
  stop: () => void;
}

/**
 * Debug and test tooling: answers the question sheet for the autopilot by tapping the real
 * answer buttons (correctly, via the shell's debug oracle) and closes it once energy is
 * topped up. Going through the DOM means automated climbs exercise the real sheet.
 */
export function createAutopilotAnswerer(options: AutopilotAnswererOptions): AutopilotAnswerer {
  const { document } = options;
  const askBelow = options.askBelow ?? 40;
  const timer = setInterval(() => {
    const sheet = document.querySelector('[data-testid="question-sheet"]');
    if (!sheet) return;
    if (options.energy() >= options.refillTo) {
      sheet.querySelector<HTMLButtonElement>('[data-testid="close-sheet"]')?.click();
      return;
    }
    const questionId = sheet.querySelector('[data-question-id]')?.getAttribute('data-question-id');
    if (!questionId) return;
    const answer = sheet.querySelector<HTMLButtonElement>(
      `[data-option-id="${options.correctOptionFor(questionId)}"]`,
    );
    if (answer && !answer.disabled) answer.click();
  }, 200);
  return {
    needsEnergy: () => options.energy() < askBelow,
    stop: () => clearInterval(timer),
  };
}
