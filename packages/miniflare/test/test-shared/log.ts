import { Log, LogLevel } from "@miniflare/tre";

export type LogEntry = [level: LogLevel, message: string];
export class TestLog extends Log {
	logs: LogEntry[] = [];

	constructor() {
		super(LogLevel.VERBOSE);
	}

	log(message: string): void {
		this.logs.push([LogLevel.NONE, message]);
	}

	logWithLevel(level: LogLevel, message: string): void {
		this.logs.push([level, message]);
	}

	error(message: Error): void {
		throw message;
	}

	logsAtLevel(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}
