import { z } from 'zod';

/**
 * Host-controlled settings for a Climber game. The New game form is generated from this
 * schema (titles and help come from `.meta`), so a new setting needs no form code. The game's
 * length, player cap and late joining are platform room settings, not part of this schema.
 */
export const climberSettingsSchema = z.object({
  energyPerCorrectAnswer: z.number().int().min(20).max(500).default(100).meta({
    title: 'Energy per correct answer',
    description: 'More energy means more climbing for each right answer.',
    unit: 'energy',
  }),
  checkpointsEnabled: z.boolean().default(false).meta({
    title: 'Checkpoints',
    description:
      'Players who fall can go back to the last summit they reached. Good for younger classes.',
  }),
  summitGoal: z
    .number()
    .int()
    .min(1)
    .max(6)
    .default(6)
    .meta({ title: 'Summit goal', unit: 'summits', assignmentsOnly: true }),
});

/** Settings a host chooses for one Climber game. */
export type ClimberSettings = z.infer<typeof climberSettingsSchema>;

/** Spec defaults for every host setting. */
export const defaultClimberSettings: ClimberSettings = climberSettingsSchema.parse({});
