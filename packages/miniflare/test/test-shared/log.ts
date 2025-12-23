import { Log, LogLevel, stripAnsi } from "miniflare";

const consoleLog = new Log(LogLevel.VERBOSE);

export type LogEntry = [level: LogLevel, message: string];
export class TestLog extends Log {
	logs: LogEntry[] = [];

	constructor() {
		super(LogLevel.VERBOSE);
	}

	log(message: string): void {
		this.logs.push([LogLevel.NONE, stripAnsi(message)]);
	}

	logWithLevel(level: LogLevel, message: string): void {
		this.logs.push([level, stripAnsi(message)]);
	}

	error(message: Error): void {
		consoleLog.error(message);
		throw message;
	}

	logsAtLevel(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}
