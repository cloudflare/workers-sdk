import chalk from "chalk";
import CLITable from "cli-table3";
import { logger } from "./logger";

type TableRow<Keys extends string> = Record<Keys, string>;
export function table<Keys extends string>(data: TableRow<Keys>[]): void {
	const keys: Keys[] =
		data.length === 0 ? [] : (Object.keys(data[0]) as Keys[]);
	const t = new CLITable({
		head: keys.map((k) => chalk.bold.blue(k)),
	});
	t.push(...data.map((row) => keys.map((k) => row[k])));
	logger.log(t.toString());
}

export function line(text: string): void {
	logger.log(text);
}
