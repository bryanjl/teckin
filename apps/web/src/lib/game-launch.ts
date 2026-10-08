import {
  readSettingsForm,
  roomSettingsSchema,
  settingsFormFields,
  settingsProblems,
  type ClientGame,
  type RoomSettings,
  type SettingsField,
} from '@teckin/game-contracts';
import { questionSetSchema, type QuestionSet } from '@teckin/questions';

/** Input names on the New game form: `game.<setting>` and `room.<setting>`. */
export const gameSettingPrefix = 'game.';
export const roomSettingPrefix = 'room.';

/** One game as the New game form offers it: its name and its settings fields. */
export interface GameChoice {
  id: string;
  displayName: string;
  fields: SettingsField[];
}

/** The platform settings every game has (length, player cap, late joining). */
export function roomSettingsFields(): SettingsField[] {
  return settingsFormFields(roomSettingsSchema);
}

/** The New game form's game list, with fields generated from each game's settings schema. */
export function gameChoicesFor(games: readonly ClientGame[]): GameChoice[] {
  return games.map(({ definition }) => ({
    id: definition.id,
    displayName: definition.displayName,
    fields: settingsFormFields(definition.settingsSchema),
  }));
}

/** A New game form as submitted, checked. */
export type NewGameSubmission =
  | {
      ok: true;
      gameId: string;
      questionSetId: string;
      gameSettings: Record<string, unknown>;
      roomSettings: RoomSettings;
    }
  | {
      ok: false;
      /** Problems by input name (`game.x`, `room.y`, `gameId`, `questionSetId`). */
      problems: Record<string, string>;
    };

/**
 * Reads a submitted New game form: the chosen game (one of `games`), the chosen set, and both
 * groups of settings, each validated by its own schema.
 */
export function readNewGameForm(
  form: { get: (name: string) => unknown },
  games: readonly ClientGame[],
): NewGameSubmission {
  const text = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === 'string' ? value : null;
  };
  const game = games.find((candidate) => candidate.definition.id === text('gameId'));
  const questionSetId = text('questionSetId')?.trim() ?? '';
  const problems: Record<string, string> = {};
  if (!game) problems.gameId = 'Choose a game.';
  if (!questionSetId) problems.questionSetId = 'Choose a question set.';

  const roomFields = roomSettingsFields();
  const roomResult = roomSettingsSchema.safeParse(
    readSettingsForm(roomFields, (name) => text(roomSettingPrefix + name)),
  );
  if (!roomResult.success) {
    for (const [name, message] of Object.entries(settingsProblems(roomFields, roomResult.error))) {
      problems[roomSettingPrefix + name] = message;
    }
  }

  let gameSettings: Record<string, unknown> = {};
  if (game) {
    const gameFields = settingsFormFields(game.definition.settingsSchema);
    const gameResult = game.definition.settingsSchema.safeParse(
      readSettingsForm(gameFields, (name) => text(gameSettingPrefix + name)),
    );
    if (gameResult.success) {
      gameSettings = gameResult.data as Record<string, unknown>;
    } else {
      for (const [name, message] of Object.entries(
        settingsProblems(gameFields, gameResult.error),
      )) {
        problems[gameSettingPrefix + name] = message;
      }
    }
  }

  if (!game || !roomResult.success || Object.keys(problems).length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    gameId: game.definition.id,
    questionSetId,
    gameSettings,
    roomSettings: roomResult.data,
  };
}

/** The question set as copied into a game when it launched (see `QuestionSnapshot` in `@teckin/db`). */
export interface LaunchSnapshot {
  questionSetId: string;
  title: string;
  questions: {
    id: string;
    type: 'multipleChoice' | 'trueFalse';
    prompt: string;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
}

/**
 * Turns a launched game's question snapshot into the question set the realtime room plays.
 * Ids stay the database ids, so answer events and reports line up with the snapshot.
 */
export function questionSetFromSnapshot(snapshot: LaunchSnapshot): QuestionSet {
  return questionSetSchema.parse({
    id: snapshot.questionSetId,
    title: snapshot.title,
    questions: snapshot.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    })),
  });
}
