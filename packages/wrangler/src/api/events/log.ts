import { TypedEvent } from "./index";
import type { LoggerLevel } from "../../logger";

export class LogEvent extends TypedEvent<"log"> {
	public message: string;
	public level: LoggerLevel;

	constructor(level: LoggerLevel, message: string) {
		super("log", { cancelable: false });
		this.message = message;
		this.level = level;
	}

	static error(message: string): LogEvent {
		return new LogEvent("error", message);
	}

	static warn(message: string): LogEvent {
		return new LogEvent("warn", message);
	}

	static log(message: string): LogEvent {
		return new LogEvent("log", message);
	}

	static debug(message: string): LogEvent {
		return new LogEvent("debug", message);
	}
}
