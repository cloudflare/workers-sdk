export type Logger = {
	debug: (...args: unknown[]) => void;
	debugWithSanitization: (label: string, ...args: unknown[]) => void;
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};
