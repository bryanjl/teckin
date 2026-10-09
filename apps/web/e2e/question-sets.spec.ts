import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openCard, writeMultipleChoice, writeTrueFalse } from './support/editor';
import { databaseAvailable, e2eSignInOrigin, signUpHost } from './support/sign-in';

const summaryPrompts = (page: Page) =>
  page.getByTestId('question-summary-prompt').allTextContents();

/** A CSV of `count` questions alternating multiple choice and true/false. */
function questionCsv(count: number): string {
  const lines = ['Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4'];
  for (let index = 1; index <= count; index += 1) {
    lines.push(
      index % 2 === 0
        ? `Is ${index} an even number?,true false,True,,,,`
        : `"What is ${index} + ${index}?",multiple choice,${index * 2},${index * 2 - 1},${index * 2},${index * 2 + 1},`,
    );
  }
  return lines.join('\r\n');
}

test.describe('question sets', () => {
  test.use({ baseURL: e2eSignInOrigin });
  test.skip(!databaseAvailable, 'Needs DATABASE_URL (a migrated Postgres) for the web server.');
  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith('portrait'),
      'The editor runs on the portrait phone profiles only.',
    );
  });

  test('a host writes, reorders, copies and deletes questions and sets', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await signUpHost(page, 'editor');
    await expect(page.getByTestId('no-question-sets')).toBeVisible();
    await expect(page.getByTestId('no-recent-games')).toBeVisible();
    await expect(page.getByTestId('new-game-hint')).toBeVisible();

    await page.getByRole('link', { name: '+ New set' }).click();
    await expect(page).toHaveURL(/\/dashboard\/sets\/new$/);
    await page.getByTestId('set-title').fill('Animals');

    await writeMultipleChoice(page, 'How many legs does a spider have?', ['6', '8', '10'], 1);
    await writeTrueFalse(page, 'Fish can swim.', 'True');

    // An unfinished question blocks the save and says why.
    await page.getByRole('button', { name: '+ Multiple choice' }).click();
    await page.getByTestId('save-set').click();
    await expect(page.getByTestId('save-status')).toHaveText('Fix 1 question before saving.');
    await expect(openCard(page)).toContainText('The question is empty.');
    await expect(openCard(page)).toContainText('Mark the correct answer.');
    await openCard(page).getByRole('button', { name: 'Delete question 3' }).click();
    await openCard(page).getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByTestId('question-card')).toHaveCount(2);
    await expect(page.getByTestId('set-readiness')).toContainText('Add 3 more questions');

    // Duplicate the spider question, turn the copy into an ant question, move it last then up.
    await page.getByRole('button', { name: 'Edit question 1' }).click();
    await openCard(page).getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(openCard(page)).toHaveAttribute('data-question-number', '2');
    await openCard(page).getByTestId('question-prompt').fill('How many legs does an ant have?');
    await openCard(page).getByRole('radio', { name: 'Answer 1 is correct' }).check();
    await openCard(page).getByRole('button', { name: 'Move question 2 down' }).click();
    await expect(openCard(page)).toHaveAttribute('data-question-number', '3');
    await openCard(page).getByRole('button', { name: 'Done' }).click();
    expect(await summaryPrompts(page)).toEqual([
      'How many legs does a spider have?',
      'Fish can swim.',
      'How many legs does an ant have?',
    ]);

    await writeTrueFalse(page, 'Bats are birds.', 'False');
    await writeMultipleChoice(page, 'Which animal is a mammal?', ['Shark', 'Whale'], 1);
    await expect(page.getByTestId('set-readiness')).toHaveAttribute('data-playable', 'true');
    await expect(page.getByTestId('set-readiness')).toHaveText('Ready for a game · 5 questions');

    await page.getByTestId('save-set').click();
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
    await expect(page).toHaveURL(/\/dashboard\/sets\/[0-9a-f-]{36}$/);
    const setUrl = page.url();

    // Everything survives a reload, in order, with the right answers marked.
    await page.reload();
    await expect(page.getByTestId('set-title')).toHaveValue('Animals');
    expect(await summaryPrompts(page)).toEqual([
      'How many legs does a spider have?',
      'Fish can swim.',
      'How many legs does an ant have?',
      'Bats are birds.',
      'Which animal is a mammal?',
    ]);
    await expect(page.getByTestId('question-card').nth(0)).toContainText('Answer: 8');
    await expect(page.getByTestId('question-card').nth(2)).toContainText('Answer: 6');
    await expect(page.getByTestId('question-card').nth(3)).toContainText('Answer: False');

    // A second tab that loaded the set before this save cannot overwrite it.
    const otherTab = await page.context().newPage();
    await otherTab.goto(setUrl);
    await page.getByTestId('set-title').fill('Animal facts');
    await page.getByTestId('save-set').click();
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
    await otherTab.getByTestId('set-title').fill('Old tab title');
    await otherTab.getByTestId('save-set').click();
    await expect(otherTab.getByTestId('save-status')).toHaveAttribute('data-status', 'stale');
    await otherTab.close();

    await page.getByRole('link', { name: '← Dashboard' }).click();
    await expect(page.getByTestId('question-set')).toHaveCount(1);
    await expect(page.getByTestId('question-set')).toContainText('Animal facts');
    await expect(page.getByTestId('question-set')).toContainText('5 questions');
    await expect(page.getByTestId('new-game-hint')).toHaveCount(0);

    // Duplicate the set, then delete the copy.
    await page.getByTestId('question-set').click();
    await page.getByRole('button', { name: 'Duplicate set' }).click();
    await expect(page).toHaveURL(/\?copied=1$/);
    await expect(page.getByTestId('editor-notice')).toContainText('This is your copy');
    await expect(page.getByTestId('set-title')).toHaveValue('Copy of Animal facts');
    await expect(page.getByTestId('question-card')).toHaveCount(5);
    expect(page.url()).not.toContain(setUrl);
    await page.getByRole('button', { name: 'Delete set' }).click();
    await page.getByRole('button', { name: 'Yes, delete this set' }).click();
    await expect(page).toHaveURL(/\/dashboard\?deleted=1$/);
    await expect(page.getByTestId('set-deleted')).toBeVisible();
    await expect(page.getByTestId('question-set')).toHaveCount(1);
    await expect(page.getByTestId('question-set')).toContainText('Animal facts');

    // Another host cannot open this host's set.
    const strangerContext = await browser.newContext({ baseURL: e2eSignInOrigin });
    const stranger = await strangerContext.newPage();
    await signUpHost(stranger, 'stranger');
    const response = await stranger.goto(setUrl);
    expect(response?.status()).toBe(404);
    await stranger.goto('/dashboard');
    await expect(stranger.getByTestId('no-question-sets')).toBeVisible();
    await strangerContext.close();
  });

  test('a 50-question CSV imports, and a malformed one shows which rows failed and why', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUpHost(page, 'importer');
    await page.getByRole('link', { name: 'Import from CSV' }).click();
    await expect(page.getByTestId('csv-import')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('csv-template-link').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('teckin-question-template.csv');
    const template = await readFile(await download.path(), 'utf8');
    expect(template.replace(/^\uFEFF/, '').split('\r\n')[0]).toBe(
      'Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4',
    );

    const malformed = [
      'Question,Type,Correct answer,Answer 1,Answer 2,Answer 3,Answer 4',
      'Fine question,multiple choice,b,a,b,,',
      'Wrong answer,multiple choice,z,a,b,,',
      ',true false,True,,,,',
      'Bad truth,true false,maybe,,,,',
    ].join('\n');
    await page.getByTestId('csv-file-input').setInputFiles({
      name: 'broken.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(malformed),
    });
    await expect(page.getByTestId('csv-import-summary')).toHaveText(
      '1 question is ready to add. 3 rows could not be read.',
    );
    const problems = page.getByTestId('csv-row-problem');
    await expect(problems).toHaveCount(3);
    await expect(problems.nth(0)).toHaveAttribute('data-row', '3');
    await expect(problems.nth(0)).toContainText(
      'The correct answer "z" is not one of the answers.',
    );
    await expect(problems.nth(1)).toHaveAttribute('data-row', '4');
    await expect(problems.nth(1)).toContainText('The question is empty.');
    await expect(problems.nth(2)).toHaveAttribute('data-row', '5');
    await expect(problems.nth(2)).toContainText('must be True or False');
    await expect(page.getByTestId('csv-import-add')).toHaveText('Add the 1 that worked');

    await page.getByTestId('csv-file-input').setInputFiles({
      name: 'not-questions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Name,Age\nSam,8\n'),
    });
    await expect(page.getByTestId('csv-file-problem')).toContainText('Missing: "Question"');

    await page.getByTestId('csv-file-input').setInputFiles({
      name: 'fifty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(questionCsv(50)),
    });
    await expect(page.getByTestId('csv-import-summary')).toHaveText(
      '50 questions are ready to add.',
    );
    await expect(page.getByTestId('csv-row-problem')).toHaveCount(0);
    await page.getByTestId('csv-import-add').click();
    await expect(page.getByTestId('question-card')).toHaveCount(50);
    await expect(page.getByTestId('editor-notice')).toHaveText(
      'Added 50 questions. Save to keep them.',
    );

    await page.getByTestId('set-title').fill('Doubles and evens');
    await page.getByTestId('save-set').click();
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
    await page.reload();
    await expect(page.getByTestId('question-card')).toHaveCount(50);
    await expect(page.getByTestId('question-card').first()).toContainText('What is 1 + 1?');
    await expect(page.getByTestId('question-card').first()).toContainText('Answer: 2');
    await expect(page.getByTestId('question-card').nth(1)).toContainText('Answer: True');
    await expect(page.getByTestId('set-readiness')).toHaveText('Ready for a game · 50 questions');
  });
});
