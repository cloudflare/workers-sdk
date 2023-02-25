import { Log, LogLevel } from "@miniflare/tre";
import { ExecutionContext } from "ava";

const consoleLog = new Log(LogLevel.VERBOSE);

export type LogEntry = [level: LogLevel, message: string];
export class TestLog extends Log {
	logs: LogEntry[] = [];

	constructor(private readonly t?: ExecutionContext) {
		super(LogLevel.VERBOSE);
	}

	log(message: string): void {
		this.logs.push([LogLevel.NONE, message]);
	}

	logWithLevel(level: LogLevel, message: string): void {
		this.logs.push([level, message]);
	}

	error(message: Error): void {
		if (this.t === undefined) {
			throw message;
		} else {
			consoleLog.error(message);
			this.t.fail(message.stack);
		}
	}

	logsAtLevel(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}
