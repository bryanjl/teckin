import type { QuestionType } from './generated/prisma/enums';

/** The question set a game was played with, as stored in its snapshot. */
export interface ReportQuestionSource {
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
}

/** The recorded rows a report is built from. */
export interface GameReportInput {
  snapshot: ReportQuestionSource;
  participants: { id: string; nickname: string; removedAt: Date | null }[];
  answers: {
    participantId: string;
    questionId: string;
    chosenOptionId: string;
    isCorrect: boolean;
    millisecondsTaken: number;
  }[];
  results: { participantId: string; rank: number; gameStats: unknown }[];
}

/** One player's line in a report. */
export interface PlayerReportRow {
  participantId: string;
  nickname: string;
  /** Final placing, or null when the game recorded none for them (for example, removed). */
  rank: number | null;
  removed: boolean;
  questionsAnswered: number;
  correctAnswers: number;
  /** Correct answers divided by answers, 0–1; null with no answers. */
  accuracy: number | null;
  averageMillisecondsTaken: number | null;
  /** The game's own figures for this player, such as best height. */
  gameStats: Record<string, number | string>;
}

/** How often one answer was chosen for a question. */
export interface OptionReportRow {
  optionId: string;
  text: string;
  isCorrect: boolean;
  timesChosen: number;
}

/** One question's line in a report. */
export interface QuestionReportRow {
  questionId: string;
  /** 1-based place in the set as it was played. */
  number: number;
  type: QuestionType;
  prompt: string;
  timesAnswered: number;
  correctAnswers: number;
  /** Correct answers divided by answers, 0–1; null when nobody answered it. */
  accuracy: number | null;
  options: OptionReportRow[];
}

/** A finished game's report: final ranking with each player's figures, and every question. */
export interface GameReport {
  /** Ranked players first (by rank), then any without a rank, by nickname. */
  players: PlayerReportRow[];
  /** Hardest first: lowest accuracy, then most answered; unanswered questions last. */
  questions: QuestionReportRow[];
  totals: {
    players: number;
    answers: number;
    correctAnswers: number;
    accuracy: number | null;
  };
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function groupInto<Item>(groups: Map<string, Item[]>, key: string, item: Item): void {
  const group = groups.get(key);
  if (group) group.push(item);
  else groups.set(key, [item]);
}

function plainStats(value: unknown): Record<string, number | string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const stats: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' || typeof entry === 'string') stats[key] = entry;
  }
  return stats;
}

/**
 * Builds a game's report from its recorded rows. Pure, so every figure can be checked against
 * the answers it came from. Shared by every game: game-specific figures stay in `gameStats`.
 */
export function buildGameReport(input: GameReportInput): GameReport {
  const answersByPlayer = new Map<string, GameReportInput['answers']>();
  const answersByQuestion = new Map<string, GameReportInput['answers']>();
  for (const answer of input.answers) {
    groupInto(answersByPlayer, answer.participantId, answer);
    groupInto(answersByQuestion, answer.questionId, answer);
  }
  const resultByPlayer = new Map(input.results.map((result) => [result.participantId, result]));

  const players: PlayerReportRow[] = input.participants.map((participant) => {
    const answers = answersByPlayer.get(participant.id) ?? [];
    const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
    const totalMilliseconds = answers.reduce((sum, answer) => sum + answer.millisecondsTaken, 0);
    const result = resultByPlayer.get(participant.id);
    return {
      participantId: participant.id,
      nickname: participant.nickname,
      rank: result?.rank ?? null,
      removed: participant.removedAt !== null,
      questionsAnswered: answers.length,
      correctAnswers,
      accuracy: ratio(correctAnswers, answers.length),
      averageMillisecondsTaken:
        answers.length === 0 ? null : Math.round(totalMilliseconds / answers.length),
      gameStats: plainStats(result?.gameStats),
    };
  });
  players.sort((first, second) => {
    if (first.rank !== null && second.rank !== null) return first.rank - second.rank;
    if (first.rank !== null) return -1;
    if (second.rank !== null) return 1;
    return first.nickname.localeCompare(second.nickname);
  });

  const questions: QuestionReportRow[] = input.snapshot.questions.map((question, index) => {
    const answers = answersByQuestion.get(question.id) ?? [];
    const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
    return {
      questionId: question.id,
      number: index + 1,
      type: question.type,
      prompt: question.prompt,
      timesAnswered: answers.length,
      correctAnswers,
      accuracy: ratio(correctAnswers, answers.length),
      options: question.options.map((option) => ({
        optionId: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
        timesChosen: answers.filter((answer) => answer.chosenOptionId === option.id).length,
      })),
    };
  });
  questions.sort((first, second) => {
    if (first.accuracy === null || second.accuracy === null) {
      if (first.accuracy === second.accuracy) return first.number - second.number;
      return first.accuracy === null ? 1 : -1;
    }
    return (
      first.accuracy - second.accuracy ||
      second.timesAnswered - first.timesAnswered ||
      first.number - second.number
    );
  });

  const correctAnswers = input.answers.filter((answer) => answer.isCorrect).length;
  return {
    players,
    questions,
    totals: {
      players: input.participants.length,
      answers: input.answers.length,
      correctAnswers,
      accuracy: ratio(correctAnswers, input.answers.length),
    },
  };
}

/** An accuracy as a whole percentage for display ("67%"), or a dash with no answers. */
export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? '–' : `${Math.round(accuracy * 100)}%`;
}
