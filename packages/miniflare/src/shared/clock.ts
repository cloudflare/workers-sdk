export type Clock = () => number;
export const defaultClock: Clock = () => Date.now();

export function millisToSeconds(millis: number): number {
	return Math.floor(millis / 1000);
}
