export const UNKNOWN_HOST = 'http://localhost';
export const INIT_PATH = '/__vite_plugin_cloudflare_init__';

export function invariant(
	condition: unknown,
	message: string,
): asserts condition {
	if (condition) {
		return;
	}

	throw new Error(message);
}
