import { getStudioTableNameFromSQL } from "./formatter";
import type {
	IStudioDriver,
	StudioMultipleQueryProgress,
	StudioMultipleQueryResult,
} from "../../types/studio";

/**
 * Executes multiple SQL statements in sequence and reports progress.
 *
 * Each statement's execution time, error (if any), and result stats
 * are tracked and reported through the `onProgress` callback.
 *
 * @param driver - The database driver to execute queries with.
 * @param statements - An array of SQL statements to run.
 * @param onProgress - Optional callback to report progress and logs during execution.
 *
 * @returns A list of successful results and all execution logs.
 */
export async function runStudioMultipleSQLStatements(
	driver: IStudioDriver,
	statements: string[],
	onProgress?: (progress: StudioMultipleQueryProgress) => void
): Promise<{
	logs: StudioMultipleQueryProgress["logs"];
	result: StudioMultipleQueryResult[];
}> {
	const logs = new Array<StudioMultipleQueryProgress["logs"][number]>();
	const result = new Array<StudioMultipleQueryResult>();
	const total = statements.length;

	function reportProgress(progress: number, error = false): void {
		onProgress?.({
			error,
			logs,
			progress,
			total,
		});
	}

	for (let i = 0; i < statements.length; i++) {
		const statement = statements[i] as string;
		const sql = statement;

		const logEntry: StudioMultipleQueryProgress["logs"][number] = {
			order: i,
			sql,
			start: Date.now(),
		};

		logs.push(logEntry);
		reportProgress(i + 1);

		try {
			const r = await driver.query(sql);

			logEntry.end = Date.now();
			logEntry.stats = r.stat;

			// Inject the query request time
			r.stat = {
				...r.stat,
				requestDurationMs: logEntry.end ? logEntry.end - logEntry.start : null,
			};

			if (r.headers.length > 0) {
				const predictedTableName = getStudioTableNameFromSQL(sql);

				result.push({
					order: i,
					predictedTableName,
					result: r,
					sql: statement,
				});
			}

			reportProgress(i + 1);
		} catch (e) {
			logEntry.end = Date.now();
			logEntry.error = (e as Error).toString();

			reportProgress(i + 1, true);
			break;
		}
	}

	return {
		logs,
		result,
	};
}
