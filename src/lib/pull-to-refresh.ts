export const PULL_TO_REFRESH_THRESHOLD = 60;
const MAX_PULL_DISTANCE = 96;
const PULL_RESISTANCE = 0.5;

interface TouchPoint {
  x: number;
  y: number;
}

/** Returns a damped pull distance only for a downward vertical gesture at top. */
export function pullToRefreshDistance(
  start: TouchPoint,
  current: TouchPoint,
  scrollTop: number,
): number {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  if (scrollTop > 0 || deltaY <= 0 || Math.abs(deltaX) > deltaY) return 0;
  return Math.min(Math.round(deltaY * PULL_RESISTANCE), MAX_PULL_DISTANCE);
}

export function pullToRefreshArmed(distance: number): boolean {
  return distance >= PULL_TO_REFRESH_THRESHOLD;
}
