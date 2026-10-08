'use client';

import { useMemo } from 'react';
import { qrMatrix, qrPath } from '../../../lib/qr';
import { displayJoinLink, formatJoinCode } from './host-view';

/** A QR code for `link`, drawn as one SVG path (dark on white, so any phone camera reads it). */
export function JoinQrCode({ link, className }: { link: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(link);
    return { size: matrix.size, path: qrPath(matrix) };
  }, [link]);
  return (
    <svg
      data-testid="join-qr"
      data-qr-text={link}
      role="img"
      aria-label={`QR code for ${displayJoinLink(link)}`}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={`rounded-2xl bg-white ${className ?? ''}`}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * How to join, sized for the back of a classroom: the join link, the code in huge digits and
 * a QR code. `compact` is the strip shown beside the tower once the game is running.
 */
export function JoinPanel({
  code,
  link,
  compact = false,
}: {
  code: string;
  link: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        data-testid="join-strip"
        className="flex items-center gap-4 rounded-2xl bg-slate-800 p-3"
      >
        <JoinQrCode link={link} className="size-24 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-300">Join at {displayJoinLink(link).split('?')[0]}</p>
          <p data-testid="join-code" className="text-4xl font-black tracking-wider text-amber-400">
            {formatJoinCode(code)}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:items-center lg:text-left">
      <div className="flex flex-col gap-2">
        <p className="text-2xl text-slate-300">
          Go to{' '}
          <strong data-testid="join-link" className="break-all text-white">
            {displayJoinLink(link).split('?')[0]}
          </strong>
        </p>
        <p className="text-2xl text-slate-300">and enter the code</p>
        <p
          data-testid="join-code"
          className="text-[clamp(4rem,8vw,9rem)] leading-none font-black tracking-wider whitespace-nowrap text-amber-400"
        >
          {formatJoinCode(code)}
        </p>
        <p className="text-lg text-slate-400">or scan the code with a phone camera</p>
      </div>
      <JoinQrCode link={link} className="size-[min(36vh,320px)] shrink-0 p-2" />
    </div>
  );
}
