/** Time-of-day greeting used on the dashboard header ("Good morning, Anitha 👋"). */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
