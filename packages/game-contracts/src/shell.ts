import type { AnswerSummary } from '@teckin/questions';
import type { GameSession } from './session';

/** Sounds every game can ask the platform to play. */
export type GameSoundName = 'jump' | 'land' | 'correct' | 'wrong' | 'summit' | 'finish' | 'tap';

/** Plays short synthesised sounds; muting is remembered by the platform. */
export interface GameSoundPlayer {
  play(name: GameSoundName): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  /** Calls `listener` when muting changes. Returns an unsubscribe function. */
  onMutedChange(listener: (muted: boolean) => void): () => void;
}

/** Colours and font the shared UI uses, taken from the game's theme pack. */
export interface ShellAppearance {
  /** Six-digit hex colours. */
  accent: string;
  panel: string;
  text: string;
  textMuted: string;
  /** Colour for correct answers. */
  correct: string;
  /** Colour for wrong answers. */
  wrong: string;
  fontFamily: string;
}

/** What the question sheet needs from the game when it opens. */
export interface QuestionSheetRequest {
  /** The theme's word for energy, e.g. "Energy" or "Wind-up". */
  energyWord: string;
  appearance: ShellAppearance;
}

/** One labelled value on the results screen, e.g. "Summits reached" → "6 of 6". */
export interface ResultStat {
  label: string;
  value: string;
}

/** What the shared results screen shows at the end of a game. */
export interface GameResults {
  /** Heading, e.g. "Course complete". */
  title: string;
  elapsedSeconds: number;
  /** Game-specific rows shown under the time. */
  stats: ResultStat[];
  answers: AnswerSummary;
  appearance: ShellAppearance;
}

/**
 * Everything the platform gives a running game besides its mount element: the session for
 * questions and energy, the shared question sheet and results screen, and sound. The web
 * app implements it with React components from `@teckin/ui`; games stay framework-free.
 */
export interface ClientGameShell {
  session: GameSession;
  /** Opens the question sheet. Resolves when the player closes it. */
  openQuestionSheet(request: QuestionSheetRequest): Promise<void>;
  /** Shows the results screen; `onPlayAgain` is called when the player asks to replay. */
  showResults(results: GameResults, onPlayAgain: () => void): void;
  /** Hides the results screen. */
  hideResults(): void;
  sound: GameSoundPlayer;
  /**
   * Solo debug and test tooling only: the correct option for a question, so the autopilot
   * can answer through the real sheet. Absent in normal play and in networked games.
   */
  debugCorrectOptionFor?: (questionId: string) => string;
}
