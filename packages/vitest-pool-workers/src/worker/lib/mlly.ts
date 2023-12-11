function isObject(value: unknown) {
	return value !== null && typeof value === "object";
}

export function resolvePathSync() {
	throw new Error("resolvePathSync() not yet implemented in worker");
}

// https://github.com/unjs/mlly/blob/71563c22ec7dbf25672d46bc679619dbd65e79d2/src/cjs.ts#L34
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function interopDefault(sourceModule: any): any {
	if (!isObject(sourceModule) || !("default" in sourceModule)) {
		return sourceModule;
	}
	const newModule = sourceModule.default;
	for (const key in sourceModule) {
		if (key === "default") {
			try {
				if (!(key in newModule)) {
					Object.defineProperty(newModule, key, {
						enumerable: false,
						configurable: false,
						get() {
							return newModule;
						},
					});
				}
			} catch {}
		} else {
			try {
				if (!(key in newModule)) {
					Object.defineProperty(newModule, key, {
						enumerable: true,
						configurable: true,
						get() {
							return sourceModule[key];
						},
					});
				}
			} catch {}
		}
	}
	return newModule;
}
