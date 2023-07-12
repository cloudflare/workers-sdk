import { fetchResult } from "../../cfetch";
import { getDatabaseInfoFromId } from "../utils";
import type { BookmarkResponse } from "./types";

/**
 * a function to grab the nearest bookmark for a given timestamp. If no timestamp is provided, it will return the current bookmark
 * @param accountId cloudflare account id
 * @param databaseId database uuid
 * @param timestamp supports unix timestamp or ISO strings
 * @returns Promise<BookmarkResponse>
 */
export const getBookmarkIdFromTimestamp = async (
	accountId: string,
	databaseId: string,
	timestamp?: string
): Promise<BookmarkResponse> => {
	const searchParams = new URLSearchParams();

	if (timestamp && !isISODate(timestamp)) {
		searchParams.set("timestamp", new Date(Number(timestamp)).toISOString());
	} else if (timestamp) {
		searchParams.set("timestamp", timestamp);
	}
	const bookmarkResult = await fetchResult<BookmarkResponse>(
		`/accounts/${accountId}/d1/database/${databaseId}/time-travel/bookmark?${searchParams.toString()}`,
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
	return bookmarkResult;
};

export const checkIfDatabaseIsExperimental = async (
	accountId: string,
	databaseId: string
): Promise<void> => {
	const dbInfo = await getDatabaseInfoFromId(accountId, databaseId);
	if (dbInfo.version !== "beta") {
		throw new Error(
			"Time travel is only available for D1 databases created with the --experimental-backend flag"
		);
	}
};

// credits to https://github.com/honeinc/is-iso-date
const ISO_DATE_REG_EXP = new RegExp(
	/(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/
);

function isISODate(date: string) {
	return ISO_DATE_REG_EXP.test(date);
}
