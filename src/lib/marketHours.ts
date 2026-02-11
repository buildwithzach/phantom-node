/**
 * Forex market hours (24/5): Sunday 5pm ET – Friday 5pm ET.
 * Uses 22:00 UTC as proxy for 5pm ET (EST); varies slightly with DST.
 */

const CLOSE_OPEN_UTC_HOUR = 22; // 5pm ET ≈ 22:00 UTC (EST)
const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 0;

function getUTCDayHourMinutes(d: Date) {
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const mins = h * 60 + m;
  return { day, mins };
}

function nextSunday22UTC(from: Date): Date {
  const n = new Date(from);
  n.setUTCHours(CLOSE_OPEN_UTC_HOUR, 0, 0, 0);
  const d = n.getUTCDay();
  const daysUntilSun = d === 0 ? 0 : 7 - d;
  n.setUTCDate(n.getUTCDate() + daysUntilSun);
  return n;
}

function thisOrNextFriday22UTC(from: Date): Date {
  const n = new Date(from);
  n.setUTCHours(CLOSE_OPEN_UTC_HOUR, 0, 0, 0);
  const d = n.getUTCDay();
  const daysUntilFri = (FRIDAY - d + 7) % 7;
  n.setUTCDate(n.getUTCDate() + daysUntilFri);
  return n;
}

export type MarketStatus = {
  open: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
  nextEvent: 'open' | 'close';
  countdownMs: number;
  message: string;
};

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { day, mins } = getUTCDayHourMinutes(now);
  const threshold = CLOSE_OPEN_UTC_HOUR * 60;

  let open: boolean;
  let nextOpen: Date | null = null;
  let nextClose: Date | null = null;
  let nextEvent: 'open' | 'close' = 'close';
  let message: string;

  if (day === SATURDAY) {
    open = false;
    nextOpen = nextSunday22UTC(now);
    nextEvent = 'open';
    message = 'Opens Sun 22:00 UTC';
  } else if (day === SUNDAY && mins < threshold) {
    open = false;
    nextOpen = new Date(now);
    nextOpen.setUTCHours(CLOSE_OPEN_UTC_HOUR, 0, 0, 0);
    nextEvent = 'open';
    message = 'Opens Sun 22:00 UTC';
  } else if (day === FRIDAY && mins >= threshold) {
    open = false;
    nextOpen = nextSunday22UTC(now);
    nextEvent = 'open';
    message = 'Opens Sun 22:00 UTC';
  } else {
    open = true;
    nextClose = thisOrNextFriday22UTC(now);
    nextEvent = 'close';
    message = 'Closes Fri 22:00 UTC';
  }

  const next = nextEvent === 'open' ? nextOpen : nextClose;
  const countdownMs = next ? Math.max(0, next.getTime() - now.getTime()) : 0;

  return { open, nextOpen, nextClose, nextEvent, countdownMs, message };
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMins = Math.floor(ms / 60_000);
  const d = Math.floor(totalMins / (24 * 60));
  const h = Math.floor((totalMins % (24 * 60)) / 60);
  const m = totalMins % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export function formatEventCountdown(eventDate: string): { countdown: string; isPast: boolean } {
  const eventDateTime = new Date(eventDate);
  const now = new Date();
  const diffMs = eventDateTime.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return { countdown: 'Passed', isPast: true };
  }
  
  const totalMins = Math.floor(diffMs / 60_000);
  const d = Math.floor(totalMins / (24 * 60));
  const h = Math.floor((totalMins % (24 * 60)) / 60);
  const m = totalMins % 60;
  
  if (d > 0) {
    return { countdown: `${d}d ${h}h`, isPast: false };
  } else if (h > 0) {
    return { countdown: `${h}h ${m}m`, isPast: false };
  } else {
    return { countdown: `${m}m`, isPast: false };
  }
}
