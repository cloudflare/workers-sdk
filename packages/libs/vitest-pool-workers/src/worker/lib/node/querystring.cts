export function stringify(object: Record<string, string | string[]>): string {
	const params = new URLSearchParams();
	for (const [key, values] of Object.entries(object)) {
		if (Array.isArray(values)) {
			for (const value of values) params.append(key, value);
		} else {
			params.append(key, values);
		}
	}
	return params.toString();
}

export default { stringify };
