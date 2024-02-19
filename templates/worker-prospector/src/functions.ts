import { fromXML } from "from-xml";
import {
	DBNotifier,
	DBNotifierMatch,
	DBSitemap,
	DBUrl,
	ErrorXMLResponse,
	SitemapOfSitemapsXMLResponse,
	SitemapXMLResponse,
	Url,
	XMLResponseType,
} from "./types";

export async function xmlToURLs({
	url,
	sitemapId,
	authToken,
}: {
	url: string;
	sitemapId?: number;
	authToken: string;
}): Promise<
	SitemapXMLResponse | SitemapOfSitemapsXMLResponse | ErrorXMLResponse
> {
	console.log(`Making request to ${url}`);
	const resp = await fetch(url, {
		headers: {
			Authorization: `Bearer ${authToken}`,
		},
	});

	const text = await resp.text();

	console.log(`Parsing xml from ${url}`);
	const data = fromXML(text);

	if (data.sitemapindex) {
		console.log("Found sitemap of sitemaps");
		const sitemaps: Array<string> = data.sitemapindex.sitemap.map(
			(site: any) => site.loc as string
		);
		return {
			type: XMLResponseType.SitemapOfSitemaps,
			sitemaps,
		};
	} else if (data.urlset) {
		console.log("Found sitemap");

		const urls: Array<Url> = data.urlset.url.map((url: any) => ({
			url: url.loc,
			lastmod: url.lastmod,
			sitemapId,
		}));

		return {
			type: XMLResponseType.Sitemap,
			urls,
		};
	} else {
		console.log("Couldn't find a valid sitemap");

		return {
			type: XMLResponseType.Error,
			error: "Couldn't find a valid sitemap",
		};
	}
}

export function createUrl(d1Binding: D1Database, obj: Url) {
	console.log("Creating url", obj);

	const { url, lastmod, sitemapId } = obj;
	const query = "insert into urls (url, lastmod, sitemap_id) values (?, ?, ?)";
	return d1Binding.prepare(query).bind(url, lastmod, sitemapId);
}

export async function createSitemaps(
	sitemapUrl: string,
	db: D1Database,
	authToken: string
) {
	console.log("Creating sitemaps for ", sitemapUrl);

	const response = (await xmlToURLs({
		url: sitemapUrl,
		authToken: authToken,
	})) as SitemapOfSitemapsXMLResponse;

	try {
		await Promise.all(
			response.sitemaps.map((sitemap) => {
				return createSitemap(db, sitemap);
			})
		);
	} catch (err) {}

	return;
}

export async function createSitemap(d1Binding: D1Database, url: string) {
	console.log("Creating sitemap in database for ", url);
	const query = `insert into sitemaps (url) values (?)`;
	try {
		return d1Binding.prepare(query).bind(url).run();
	} catch (err) {
		console.log(`Something went wrong creating sitemap ${url}: ${err}`);
	}
}

export const getNeedsChecking = async (
	db: D1Database
): Promise<Array<DBUrl>> => {
	console.log("Getting urls that need checking from database");

	const newKeywords = await db
		.prepare(
			`
    select * from notifiers where created > date('now', '-1 day')
  `
		)
		.all();

	const noNewKeywordsToQuery = (newKeywords?.results || []).length == 0;

	const updatedByLastMod = await db
		.prepare(
			`
    select * from urls
    ${
			noNewKeywordsToQuery
				? `
      -- new records
      where last_checked is null

      -- needs rechecking
      or last_checked > date('now', '-1 day')

      -- haven't tested any new changes yet
      or date(lastmod) > date('now')
    `
				: ""
		}
  `
		)
		.all();

	console.log(
		`Found ${updatedByLastMod?.results?.length} urls that need checking`
	);

	return updatedByLastMod.results as Array<DBUrl>;
};

export const updateStoredUrls = async (db: D1Database, authToken: string) => {
	console.log("Updating stored urls");

	const { results: sitemaps } = await db
		.prepare("select * from sitemaps")
		.all<DBSitemap>();

	if (!sitemaps) {
		console.log("No sitemaps found, exiting");
		return;
	}

	const sitemapResponses: Array<SitemapXMLResponse> = await Promise.all(
		sitemaps.map(async (sitemap: DBSitemap) => {
			return (await xmlToURLs({
				url: sitemap.url,
				sitemapId: sitemap.id,
				authToken,
			})) as SitemapXMLResponse;
		})
	);

	console.log("Creating URLs in database");

	const preparedStatements = sitemapResponses
		.map((sitemapResponse) =>
			sitemapResponse.urls.map((url) => createUrl(db, url))
		)
		.flat();

	return db.batch(preparedStatements);
};

export const addUrlsToQueue = async (urls: Array<DBUrl>, queue: Queue) => {
	console.log(`Adding ${urls.length} urls to queue`);

	const chunkSize = 100;

	for (let i = 0; i < urls.length; i += chunkSize) {
		const chunk = urls.slice(i, i + chunkSize);
		const batch = chunk.map((value) => ({
			body: JSON.stringify(value),
		}));
		await (queue as any).sendBatch(batch);
	}
};

export const handleQueuedUrl = async (url: DBUrl, db: D1Database) => {
	console.log(`Checking ${url.url} for matches`);

	const notifierMatchQuery = await db
		.prepare("select * from notifier_matches")
		.all<DBNotifierMatch>();
	if (notifierMatchQuery.results === undefined) {
		console.log("No notifier matches found");
		return;
	}
	const notifierMatches: Array<DBNotifierMatch> = notifierMatchQuery.results;

	const notifierQuery = await db
		.prepare("select * from notifiers")
		.all<DBNotifier>();
	if (notifierQuery.results === undefined) {
		console.log("No notifiers found");
		return;
	}
	const notifiers: Array<DBNotifier> = notifierQuery.results;

	const response = await fetch(url.url);
	const text = await response.text();

	for (const notifier of notifiers) {
		if (text.includes(notifier.keyword)) {
			const index = text.indexOf(notifier.keyword);
			const snippet = text.substring(index - 100, index + 100);

			console.log(`Match found for ${notifier.keyword} in ${url.url}`);

			const existingNotifierMatch = notifierMatches.find(
				(notifierMatch) =>
					notifierMatch.notifier_id === notifier.id &&
					notifierMatch.url_id === url.id
			);

			if (existingNotifierMatch) {
				console.log("Match email already sent");
			} else {
				console.log("Inserting notifier match into database");
				let resp;
				try {
					console.log(
						`Inserting new notifier match: ${notifier.id}, ${url.id}`
					);
					resp = await db
						.prepare(
							`
            insert into notifier_matches (notifier_id, url_id) values (?, ?)
          `
						)
						.bind(notifier.id, url.id)
						.run();
					if (resp.error) {
						console.log(
							`Error inserting notifier match into database: ${resp.error.toString()}`
						);
					} else {
						await sendMatchEmail(notifier, url, snippet);
					}
				} catch (err) {
					console.log(
						`Error inserting notifier match into database: ${JSON.stringify(
							err
						)}`
					);
				}
			}
		}
	}

	await db
		.prepare('update urls set last_checked = date("now") where id = ?')
		.bind(url.id)
		.run();

	return;
};

export const sendMatchEmail = async (
	notifier: DBNotifier,
	url: DBUrl,
	match: string
) => {
	console.log(
		`Sending match email to ${notifier.email} for ${notifier.keyword} in ${url.url}`
	);

	const send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			personalizations: [
				{
					to: [{ email: notifier.email, name: notifier.email }],
				},
			],
			from: {
				email: "no-reply@keyword-tracker.examples.workers.dev",
				name: "Prospector",
			},
			subject: `A match was found for ${notifier.keyword}`,
			content: [
				{
					type: "text/plain",
					value: `A match was found for ${notifier.keyword} at the URL ${url.url}. We'll no longer send you notifications for this keyword on this page.\n\nHere's a snippet of the information we found:\n\n${match}`,
				},
			],
		}),
	});

	return fetch(send_request);
};

export const scheduled = async ({
	authToken,
	db,
	queue,
	sitemapUrl,
}: {
	authToken: string;
	db: D1Database;
	queue: Queue;
	sitemapUrl: string;
}) => {
	console.log("Running scheduled function");

	await createSitemaps(sitemapUrl, db, authToken);
	await updateStoredUrls(db, authToken);

	const needsChecking = await getNeedsChecking(db);
	await addUrlsToQueue(needsChecking, queue);

	return;
};
