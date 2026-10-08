import type * as Phaser from 'phaser';
import type { ThemeTextures } from '@teckin/engine-core/phaser';
import type { OtherClimberPose } from '../live/other-climbers';

/** Look of other climbers' nickname labels. */
export interface OtherClimbersArtStyle {
  fontFamily: string;
  /** Six-digit hex colours. */
  text: string;
  panel: string;
}

interface Slot {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  variant: string;
  nickname: string;
}

/** Alpha of other climbers, so this player's own climber always stands out. */
export const otherClimberAlpha = 0.55;

/**
 * Draws other players as semi-transparent climbers in their room colour with a nickname
 * label above. A fixed pool of sprites is reused every frame (no allocation while playing),
 * sized to the most climbers ever shown.
 */
export class OtherClimbersArt {
  private readonly slots: Slot[] = [];
  private labelResolution = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly textures: ThemeTextures,
    private readonly style: OtherClimbersArtStyle,
    private readonly depth: number,
  ) {}

  /** Sets how sharp labels are drawn (the camera's zoom times the render resolution). */
  setLabelResolution(resolution: number): void {
    const next = Math.min(4, Math.max(1, Math.ceil(resolution)));
    if (next === this.labelResolution) return;
    this.labelResolution = next;
    for (const slot of this.slots) slot.label.setResolution(next);
  }

  /** Shows exactly these climbers this frame. */
  update(poses: readonly OtherClimberPose[]): void {
    poses.forEach((pose, index) => {
      const slot = this.slots[index] ?? this.createSlot();
      const frame = `player-${pose.variant}`;
      if (slot.variant !== frame) {
        slot.sprite.setFrame(this.textures.hasFrame(frame) ? frame : 'player');
        slot.variant = frame;
      }
      if (slot.nickname !== pose.nickname) {
        slot.label.setText(pose.nickname);
        slot.nickname = pose.nickname;
      }
      slot.sprite
        .setPosition(pose.x, pose.y)
        .setFlipX(pose.facing < 0)
        .setVisible(true);
      slot.label.setPosition(pose.x, pose.y - slot.sprite.displayHeight - 2).setVisible(true);
    });
    for (let index = poses.length; index < this.slots.length; index += 1) {
      const slot = this.slots[index]!;
      slot.sprite.setVisible(false);
      slot.label.setVisible(false);
    }
  }

  /** Climbers drawn right now, for tests. */
  get visibleCount(): number {
    return this.slots.filter((slot) => slot.sprite.visible).length;
  }

  private createSlot(): Slot {
    const sprite = this.textures
      .image(this.scene, 0, 0, 'player')
      .setOrigin(0.5, 1)
      .setAlpha(otherClimberAlpha)
      .setDepth(this.depth);
    const label = this.scene.add
      .text(0, 0, '', {
        fontFamily: this.style.fontFamily,
        fontSize: '11px',
        fontStyle: 'bold',
        color: this.style.text,
        backgroundColor: `${this.style.panel}b3`,
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setResolution(this.labelResolution)
      .setDepth(this.depth + 1);
    const slot: Slot = { sprite, label, variant: 'player', nickname: '' };
    this.slots.push(slot);
    return slot;
  }
}
