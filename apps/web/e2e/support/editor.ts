import type { Page } from '@playwright/test';

/** The open question card (the editor opens one at a time). */
export const openCard = (page: Page) =>
  page.locator('[data-testid="question-card"][data-open="true"]');

/** Adds a multiple choice question in the set editor; `correct` is the right answer's index. */
export async function writeMultipleChoice(
  page: Page,
  prompt: string,
  answers: string[],
  correct: number,
): Promise<void> {
  await page.getByRole('button', { name: '+ Multiple choice' }).click();
  const card = openCard(page);
  await card.getByTestId('question-prompt').fill(prompt);
  for (let index = 2; index < answers.length; index += 1) {
    await card.getByRole('button', { name: 'Add an answer' }).click();
  }
  const inputs = card.getByTestId('question-option');
  for (const [index, answer] of answers.entries()) await inputs.nth(index).fill(answer);
  await card.getByRole('radio', { name: `Answer ${correct + 1} is correct` }).check();
  await card.getByRole('button', { name: 'Done' }).click();
}

/** Adds a true/false question in the set editor. */
export async function writeTrueFalse(
  page: Page,
  prompt: string,
  correct: 'True' | 'False',
): Promise<void> {
  await page.getByRole('button', { name: '+ True or false' }).click();
  const card = openCard(page);
  await card.getByTestId('question-prompt').fill(prompt);
  await card.getByRole('radio', { name: correct, exact: true }).check();
  await card.getByRole('button', { name: 'Done' }).click();
}
