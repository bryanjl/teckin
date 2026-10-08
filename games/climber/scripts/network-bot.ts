import type { Room as SdkRoom } from '@colyseus/sdk';
import { clientRequestTypes, type WelcomeMessage } from '@teckin/game-contracts';
import type { CourseBot } from '@teckin/platformer-kit';
import { NetworkSession, sdkRoomConnection, type SdkRoomLike } from '@teckin/session';
import { bundledCourseMap, createClimberCourse, type ClimberCourse } from '../src/course/course';
import { createClimberBot } from '../src/run/climber-bot';
import { ClimberLink } from '../src/run/climber-link';
import { ClimberRun } from '../src/run/climber-run';
import { defaultClimberTunables, type ClimberTunables } from '../src/tunables';

/** Options for {@link NetworkBot}. */
export interface NetworkBotOptions {
  /** The course the room plays (default: the bundled course with default tunables). */
  course?: ClimberCourse;
  /** Default: the Climber's default tunables, as the room uses. */
  tunables?: ClimberTunables;
  /** The bot's answer to a question (tests look the right one up in the seed set). */
  chooseAnswer: (questionId: string, optionIds: string[]) => string;
  /** Seconds of play the bot stands still before climbing. */
  startDelaySeconds?: number;
  /** Top up below this much energy (default: a jump, a double jump and a few steps). */
  askBelow?: number;
  /** Answer until energy reaches this. */
  refillTo?: number;
}

/**
 * A scripted player over a real room connection: the course bot climbs a real
 * {@link ClimberRun} through a {@link NetworkSession} and a {@link ClimberLink}, exactly as
 * the browser game does, and answers questions through the server when energy runs low.
 * Used by the room's acceptance tests and the realtime load test
 * (`apps/realtime/scripts/load-test.ts`).
 */
export class NetworkBot {
  readonly run: ClimberRun;
  private readonly bot: CourseBot;
  private jumpWasDown = false;
  private waitLeft: number;
  private readonly tunables: ClimberTunables;

  private constructor(
    readonly room: SdkRoom,
    readonly playerId: string,
    readonly session: NetworkSession,
    readonly link: ClimberLink,
    run: ClimberRun,
    private readonly options: NetworkBotOptions,
  ) {
    this.tunables = options.tunables ?? defaultClimberTunables;
    this.run = run;
    this.bot = createClimberBot(run);
    this.waitLeft = options.startDelaySeconds ?? 0;
  }

  /** Sets a bot up on a joined room: who it is, its energy, and where the room has it. */
  static async start(room: SdkRoom, options: NetworkBotOptions): Promise<NetworkBot> {
    const welcome = (await room.request(clientRequestTypes.whoAmI)) as WelcomeMessage;
    const session = await NetworkSession.connect(
      sdkRoomConnection(room as unknown as SdkRoomLike),
      welcome.playerId,
    );
    const tunables = options.tunables ?? defaultClimberTunables;
    const course = options.course ?? createClimberCourse(bundledCourseMap, tunables);
    const run = new ClimberRun(course, tunables, session, false);
    const link = new ClimberLink(run, session.realtime);
    await link.restore();
    return new NetworkBot(room, welcome.playerId, session, link, run, options);
  }

  /** Plays `seconds` of the game (answering first if energy is low), then reports. */
  async play(seconds: number): Promise<void> {
    const { physics } = this.tunables;
    if (this.run.completed) return;
    if (this.waitLeft > 0) {
      this.waitLeft -= seconds;
      this.link.report();
      return;
    }
    const askBelow =
      this.options.askBelow ?? this.tunables.jumpCost + this.tunables.doubleJumpCost + 10;
    if (this.session.energy < askBelow && this.run.body.onGround) {
      while (this.session.energy < (this.options.refillTo ?? 200)) {
        const question = await this.session.currentQuestion();
        const choice = this.options.chooseAnswer(
          question.id,
          question.options.map((option) => option.id),
        );
        await this.session.submitAnswer(question.id, choice);
      }
    }
    const steps = Math.round(seconds / physics.fixedStep);
    for (let index = 0; index < steps && !this.run.completed; index += 1) {
      const buttons = this.bot.decide(this.run.body);
      this.run.step({
        left: buttons.left,
        right: buttons.right,
        jumpHeld: buttons.jump,
        jumpPressed: buttons.jump && !this.jumpWasDown,
      });
      this.jumpWasDown = buttons.jump;
    }
    this.link.report();
  }

  async leave(): Promise<void> {
    this.link.dispose();
    this.session.dispose();
    await this.room.leave();
  }
}
