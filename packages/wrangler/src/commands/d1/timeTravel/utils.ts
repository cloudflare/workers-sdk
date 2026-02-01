import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../../cfetch";
import { getDatabaseInfoFromIdOrName } from "../utils";
import type { BookmarkResponse } from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * a function to grab the nearest bookmark for a given timestamp. If no timestamp is provided, it will return the current bookmark
 * @param accountId cloudflare account id
 * @param databaseId database uuid
 * @param timestamp supports unix timestamp or ISO strings
 * @returns Promise<BookmarkResponse>
 */
export const getBookmarkIdFromTimestamp = async (
	complianceConfig: ComplianceConfig,
	accountId: string,
	databaseId: string,
	timestamp?: string
): Promise<BookmarkResponse> => {
	const searchParams = new URLSearchParams();

	if (timestamp) {
		searchParams.append("timestamp", convertTimestampToISO(timestamp));
	}

	const bookmarkResult = await fetchResult<BookmarkResponse>(
		complianceConfig,
		`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark?${searchParams.toString()}`,
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
	return bookmarkResult;
};

export const throwIfDatabaseIsAlpha = async (
	complianceConfig: ComplianceConfig,
	accountId: string,
	databaseId: string
): Promise<void> => {
	const dbInfo = await getDatabaseInfoFromIdOrName(
		complianceConfig,
		accountId,
		databaseId
	);
	if (dbInfo.version === "alpha") {
		throw new UserError(
			"Time travel is not available for alpha D1 databases. You will need to migrate to a new database for access to this feature."
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

/**
 * ISO 8601 date string – like Date.prototype.toISOString(), but with local timezone offset. Credits to: https://gist.github.com/loilo/736d5beaef4a96d652f585b1b678a12c
 * @param date
 * @returns ISO string in the system's local time
 */
function getLocalISOString(date: Date) {
	const offset = date.getTimezoneOffset();
	const offsetAbs = Math.abs(offset);
	const isoString = new Date(date.getTime() - offset * 60 * 1000).toISOString();
	return `${isoString.slice(0, -1)}${offset > 0 ? "-" : "+"}${String(
		Math.floor(offsetAbs / 60)
	).padStart(2, "0")}:${String(offsetAbs % 60).padStart(2, "0")}`;
}

/**
 * a function to convert a timestamp to an ISO string
 * @param timestamp supports unix timestamp or ISO strings
 * @returns string
 */
export const convertTimestampToISO = (timestamp: string): string => {
	const parsedTimestamp = isISODate(timestamp)
		? new Date(timestamp)
		: new Date(Number(timestamp.length === 10 ? timestamp + "000" : timestamp));

	if (parsedTimestamp.toString() === "Invalid Date") {
		throw new UserError(
			`Invalid timestamp '${timestamp}'. Please provide a valid Unix timestamp or ISO string, for example: ${getLocalISOString(
				new Date()
			)}\nFor accepted format, see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format`
		);
	}

	//also check if the date is in the future, or older than 30 days, if so, throw an error
	const now = new Date();
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	if (parsedTimestamp > now) {
		throw new UserError(
			`Invalid timestamp '${timestamp}'. Please provide a timestamp in the past`
		);
	}
	if (parsedTimestamp < thirtyDaysAgo) {
		throw new UserError(
			`Invalid timestamp '${timestamp}'. Please provide a timestamp within the last 30 days`
		);
	}

	return parsedTimestamp.toISOString();
};
