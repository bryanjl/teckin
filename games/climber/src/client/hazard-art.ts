import type * as Phaser from 'phaser';
import type { ThemeTextures } from '@teckin/engine-core/phaser';
import { secondsUntilOn } from '@teckin/platformer-kit';
import type { ClimberRun } from '../run/climber-run';

/**
 * Draws the run's hazards and keeps them in step with the simulation: moving ledges slide,
 * crumbling ledges shake then vanish, vents puff steam while on, and barriers flicker as a
 * warning before their beam switches on.
 */
export class HazardArt {
  private readonly movers: { sprite: Phaser.GameObjects.TileSprite; id: string }[] = [];
  private readonly crumbling: Phaser.GameObjects.TileSprite[] = [];
  private readonly steam: { sprites: Phaser.GameObjects.Image[]; index: number }[] = [];
  private readonly beams: Phaser.GameObjects.TileSprite[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    textures: ThemeTextures,
    private readonly run: ClimberRun,
    private readonly reducedMotion: boolean,
  ) {
    const { hazards } = run.course;
    const size = run.tunables.physics.tileSize;
    for (const { spec, box } of run.hazards.platformBoxes()) {
      this.movers.push({
        id: spec.id,
        sprite: textures.tiled(scene, box.x, box.y, box.width, size, 'tile-moving'),
      });
    }
    for (const ledge of hazards.crumblingLedges) {
      const width = (ledge.toColumn - ledge.fromColumn + 1) * size;
      this.crumbling.push(
        textures.tiled(
          scene,
          ledge.fromColumn * size,
          ledge.row * size,
          width,
          size,
          'tile-crumbling',
        ),
      );
    }
    hazards.vents.forEach((vent, index) => {
      const fromLeft = vent.pushSpeed > 0;
      const wallX = fromLeft ? vent.zone.x + size / 2 : vent.zone.x + vent.zone.width - size / 2;
      const middleY = vent.zone.y + vent.zone.height / 2;
      textures.image(scene, wallX, middleY, 'hazard-vent').setFlipX(!fromLeft);
      const sprites: Phaser.GameObjects.Image[] = [];
      const puffs = Math.max(1, Math.round(vent.zone.width / size) - 1);
      for (let puff = 1; puff <= puffs; puff += 1) {
        const x = fromLeft ? wallX + puff * size : wallX - puff * size;
        sprites.push(textures.image(scene, x, middleY, 'hazard-steam').setFlipX(!fromLeft));
      }
      this.steam.push({ sprites, index });
    });
    for (const barrier of hazards.barriers) {
      const { zone } = barrier;
      const centreY = zone.y + zone.height / 2;
      this.beams.push(
        textures.tiled(scene, zone.x, centreY - size / 2, zone.width, size, 'hazard-barrier'),
      );
      textures.image(scene, zone.x + size / 2, centreY, 'hazard-barrier-emitter');
      textures.image(scene, zone.x + zone.width - size / 2, centreY, 'hazard-barrier-emitter');
    }
  }

  /** Brings the drawing up to date with the simulation. */
  update(): void {
    const field = this.run.hazards;
    const boxes = field.platformBoxes();
    this.movers.forEach((mover, index) => {
      const box = boxes[index]?.box;
      if (box) mover.sprite.setPosition(box.x, box.y);
    });

    const size = this.run.tunables.physics.tileSize;
    field.crumblingStates().forEach((entry, index) => {
      const sprite = this.crumbling[index];
      if (!sprite) return;
      const baseX = entry.ledge.fromColumn * size;
      sprite.setVisible(entry.state !== 'gone');
      const shake =
        entry.state === 'shaking' && !this.reducedMotion
          ? Math.sin(this.scene.time.now / 25) * 1.5
          : 0;
      sprite.setX(baseX + shake);
      sprite.setAlpha(entry.state === 'shaking' ? 0.75 : 1);
    });

    const { vents, barriers } = this.run.course.hazards;
    for (const { sprites, index } of this.steam) {
      const vent = vents[index];
      if (!vent) continue;
      const on = field.isOn(vent);
      sprites.forEach((sprite, puff) => {
        sprite.setVisible(on);
        if (on && !this.reducedMotion)
          sprite.setAlpha(0.55 + 0.35 * Math.sin(this.scene.time.now / 120 + puff));
      });
    }
    const warning = this.run.tunables.hazards.barrierWarningSeconds;
    barriers.forEach((barrier, index) => {
      const beam = this.beams[index];
      if (!beam) return;
      if (field.isOn(barrier)) {
        beam.setVisible(true).setAlpha(1);
        if (!this.reducedMotion) beam.tilePositionX = (this.scene.time.now / 20) % size;
      } else if (secondsUntilOn(barrier, field.seconds) < warning) {
        // Flicker before switching on, so players can time their jump.
        beam.setVisible(Math.floor(this.scene.time.now / 90) % 2 === 0).setAlpha(0.35);
      } else {
        beam.setVisible(false);
      }
    });
  }
}
