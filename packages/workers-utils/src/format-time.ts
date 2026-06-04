export function formatTime(duration: number): string {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}
