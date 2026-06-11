export const LOGGER_LEVELS = {
	none: -1,
	error: 0,
	warn: 1,
	info: 2,
	log: 3,
	debug: 4,
} as const;

export type LoggerLevel = keyof typeof LOGGER_LEVELS;

export type Logger = {
	loggerLevel?: LoggerLevel;
	debug: typeof console.debug;
	debugWithSanitization?: (label: string, ...args: unknown[]) => void;
	log: typeof console.log;
	info: typeof console.info;
	warn: typeof console.warn;
	error: typeof console.error;
	once?: {
		info: typeof console.info;
		log: typeof console.log;
		warn: typeof console.warn;
		error: typeof console.error;
	};
};
