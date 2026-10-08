import { createSeededRandom, sampleQuestionSetIds, sampleQuestionSets } from '@teckin/questions';
import { LocalSession } from '@teckin/session';
import { describe, expect, it } from 'vitest';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import { defaultClimberSettings } from '../settings';
import { defaultClimberTunables } from '../tunables';
import { simulateClimb } from './simulate-climb';

const tunables = defaultClimberTunables;
const course = createClimberCourse(bundledCourseMap, tunables);

describe('a full solo run', () => {
  it.each(sampleQuestionSetIds)(
    'climbs from the bottom to the top with the %s set, answering through the session',
    async (setId) => {
      const session = new LocalSession({
        questionSet: sampleQuestionSets[setId],
        startingEnergy: tunables.startingEnergy,
        energyPerCorrectAnswer: defaultClimberSettings.energyPerCorrectAnswer,
        random: createSeededRandom(1),
      });
      let asked = 0;
      const result = await simulateClimb({
        course,
        tunables,
        session,
        // Scripted answers: every fifth question wrong, the rest right.
        chooseAnswer: (question) => {
          asked += 1;
          const correct = session.correctOptionFor(question.id);
          const wrong = question.options.find((option) => option.id !== correct)?.id ?? correct;
          return asked % 5 === 0 ? wrong : correct;
        },
        secondsPerAnswer: 6,
        askBelow: tunables.jumpCost + tunables.doubleJumpCost + 10,
        refillTo: 200,
      });
      expect(result.finished).toBe(true);
      expect(result.summitsReached).toBe(course.summits.length);
      expect(result.questionsAnswered).toBeGreaterThan(0);
      expect(result.correctAnswers).toBeLessThan(result.questionsAnswered);
      const summary = session.answerSummary();
      expect(summary.answered).toBe(result.questionsAnswered);
      // Energy in and out balance exactly: start + earned − spent = what is left.
      expect(tunables.startingEnergy + summary.correct * 100 - result.energySpent).toBe(
        session.energy,
      );
    },
    30_000,
  );
});
