/**
 * Returns the date formatted as a compatibility date
 *
 * @param date
 * @returns The date as a `YYYY-MM-DD` string
 */
export function formatCompatibilityDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
