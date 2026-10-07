import { z } from 'zod';

/** Host-controlled settings for a Climber game. Drives the generated settings form in Phase 4. */
export const climberSettingsSchema = z.object({
  energyPerCorrectAnswer: z.number().int().min(20).max(500).default(100),
  gameDurationMinutes: z.number().int().min(5).max(60).default(15),
  checkpointsEnabled: z.boolean().default(false),
  summitGoal: z.number().int().min(1).max(6).default(6),
});

/** Settings a host chooses for one Climber game. */
export type ClimberSettings = z.infer<typeof climberSettingsSchema>;

/** Spec defaults for every host setting. */
export const defaultClimberSettings: ClimberSettings = climberSettingsSchema.parse({});
