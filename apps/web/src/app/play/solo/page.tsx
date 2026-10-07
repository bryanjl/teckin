import type { Metadata } from 'next';
import { SoloGame } from './solo-game';

export const metadata: Metadata = { title: 'Solo climb · Teckin' };

/** Solo play page: a full-screen Climber game, loaded client-side only. */
export default function SoloPlayPage() {
  return <SoloGame />;
}
