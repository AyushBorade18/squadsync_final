// Overs are stored as an integer count of LEGAL balls (43), never as a decimal (7.1).
export interface Overs { overs: number; balls: number }

export function ballsToOvers(legalBalls: number, ballsPerOver = 6): Overs {
  if (!Number.isInteger(legalBalls) || legalBalls < 0) {
    throw new RangeError('legalBalls must be a non-negative integer');
  }
  return { overs: Math.floor(legalBalls / ballsPerOver), balls: legalBalls % ballsPerOver };
}

export function formatOvers(legalBalls: number, ballsPerOver = 6): string {
  const o = ballsToOvers(legalBalls, ballsPerOver);
  return `${o.overs}.${o.balls}`;
}

/** "7.1" -> 43. Rejects "7.6" because a 7th over cannot have 6 balls bowled in it. */
export function parseOvers(text: string, ballsPerOver = 6): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new RangeError(`Invalid overs: "${text}"`);
  const overs = Number(m[1]);
  const balls = m[2] === undefined ? 0 : Number(m[2]);
  if (balls >= ballsPerOver) throw new RangeError(`Balls must be 0-${ballsPerOver - 1}`);
  return overs * ballsPerOver + balls;
}

export function runRate(runs: number, legalBalls: number, ballsPerOver = 6): number {
  return legalBalls === 0 ? 0 : runs / (legalBalls / ballsPerOver);
}

/** Runs per over needed to reach the target. Returns null if no balls remain. */
export function requiredRunRate(target: number, runs: number, ballsRemaining: number, ballsPerOver = 6): number | null {
  if (ballsRemaining <= 0) return null;
  return Math.max(0, target - runs) / (ballsRemaining / ballsPerOver);
}
