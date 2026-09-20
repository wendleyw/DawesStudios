const dayMilliseconds = 86_400_000;
export function dateNumber(date: string) {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / dayMilliseconds;
}
export function dateLabel(day: number) {
  return new Date(day * dayMilliseconds).toISOString().slice(0, 10);
}
export function mondayOf(date: string) {
  const day = dateNumber(date);
  return day - ((new Date(day * dayMilliseconds).getUTCDay() + 6) % 7);
}
export function timelineInterval(
  start: string | null,
  due: string | null,
  periodStart: number,
  days: number,
) {
  if (!start && !due) return null;
  const first = dateNumber(start ?? due!);
  const last = dateNumber(due ?? start!);
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    last < first ||
    last < periodStart ||
    first >= periodStart + days
  )
    return null;
  const left = Math.max(first, periodStart) - periodStart;
  const width = Math.min(last, periodStart + days - 1) - Math.max(first, periodStart) + 1;
  return { left, width, clippedStart: first < periodStart, clippedEnd: last >= periodStart + days };
}
