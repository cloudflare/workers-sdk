/**
 * @returns The current date formatted as YYYY-MM-DD
 */
export function getYMDDate(): string {
	const date = new Date();
	const year = date.getFullYear();
	// Months are 0-indexed
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");

	return `${year}-${month}-${day}`;
}
