import {
	d1RawDatabaseQuery,
	r2BucketDeleteObjects,
	r2BucketListObjects,
	workersKvNamespaceDeleteMultipleKeyValuePairs,
	workersKvNamespaceListANamespace_SKeys,
	workflowsDeleteWorkflow,
} from "../api";

/**
 * Safely quotes a SQLite identifier for use in dynamic DDL statements.
 */
function quoteIdentifier(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Purges all keys from a KV namespace.
 *
 * Keys are listed page-by-page, then deleted in API-sized batches.
 * Returns the number of keys targeted for deletion.
 */
export async function purgeKvNamespace(namespaceId: string): Promise<number> {
	const keysToDelete = new Array<string>();
	let nextCursor: string | undefined;

	while (true) {
		const response = await workersKvNamespaceListANamespace_SKeys({
			path: {
				namespace_id: namespaceId,
			},
			query: {
				cursor: nextCursor,
				limit: 1000,
			},
		});

		const pageKeys = response.data?.result?.map((key) => key.name) ?? [];
		keysToDelete.push(...pageKeys);

		nextCursor = response.data?.result_info?.cursor;
		if (!nextCursor) {
			break;
		}
	}

	for (let i = 0; i < keysToDelete.length; i += 1000) {
		const batch = keysToDelete.slice(i, i + 1000);
		if (batch.length === 0) {
			continue;
		}

		await workersKvNamespaceDeleteMultipleKeyValuePairs({
			body: batch,
			path: {
				namespace_id: namespaceId,
			},
		});
	}

	return keysToDelete.length;
}

/**
 * Purges all objects from an R2 bucket.
 *
 * Objects are listed with pagination and deleted in batches.
 * Returns the number of object keys targeted for deletion.
 */
export async function purgeR2Bucket(bucketName: string): Promise<number> {
	let nextCursor: string | undefined;
	const allKeys = new Array<string>();

	while (true) {
		const response = await r2BucketListObjects({
			path: {
				bucket_name: bucketName,
			},
			query: {
				cursor: nextCursor,
				per_page: 1000,
			},
		});

		const pageKeys =
			response.data?.result
				?.map((object) => object.key)
				.filter((key): key is string => Boolean(key)) ?? [];
		allKeys.push(...pageKeys);

		const isTruncated = response.data?.result_info?.is_truncated === "true";
		nextCursor = response.data?.result_info?.cursor ?? undefined;
		if (!isTruncated || !nextCursor) {
			break;
		}
	}

	for (let i = 0; i < allKeys.length; i += 1000) {
		const batch = allKeys.slice(i, i + 1000);
		if (batch.length === 0) {
			continue;
		}

		await r2BucketDeleteObjects({
			path: {
				bucket_name: bucketName,
			},
			body: batch,
		});
	}

	return allKeys.length;
}

/**
 * Fully resets a D1 database by dropping user-managed schema objects.
 *
 * This includes tables, views, indexes, and triggers (excluding internal
 * sqlite objects and local explorer metadata).
 *
 * Returns the number of `DROP` statements executed.
 */
export async function purgeD1Database(databaseId: string): Promise<number> {
	const listResponse = await d1RawDatabaseQuery({
		body: {
			sql: `
				SELECT type, name
				FROM sqlite_master
				WHERE name NOT LIKE 'sqlite_%'
					AND name != '_cf_METADATA'
					AND type IN ('table', 'view', 'index', 'trigger')
				ORDER BY CASE type
					WHEN 'trigger' THEN 1
					WHEN 'view' THEN 2
					WHEN 'index' THEN 3
					WHEN 'table' THEN 4
					ELSE 5
				END;
			`,
		},
		path: {
			database_id: databaseId,
		},
	});

	const rows = listResponse.data?.result?.[0]?.results?.rows ?? [];
	const dropStatements = rows
		.map((row) => {
			const type = String(row[0] ?? "");
			const name = String(row[1] ?? "");

			if (!type || !name) {
				return null;
			}

			if (type === "index") {
				return `DROP INDEX IF EXISTS ${quoteIdentifier(name)};`;
			}
			if (type === "trigger") {
				return `DROP TRIGGER IF EXISTS ${quoteIdentifier(name)};`;
			}
			if (type === "view") {
				return `DROP VIEW IF EXISTS ${quoteIdentifier(name)};`;
			}
			if (type === "table") {
				return `DROP TABLE IF EXISTS ${quoteIdentifier(name)};`;
			}

			return null;
		})
		.filter((statement): statement is string => statement !== null);

	const batch = [
		{
			sql: "PRAGMA foreign_keys = OFF;",
		},
		...dropStatements.map((sql) => ({ sql })),
		{
			sql: "PRAGMA foreign_keys = ON;",
		},
	] satisfies Array<{
		sql: string;
	}>;

	await d1RawDatabaseQuery({
		body: {
			batch,
		},
		path: {
			database_id: databaseId,
		},
	});

	return dropStatements.length;
}

/**
 * Deletes all instances for a workflow in local explorer.
 */
export async function purgeWorkflow(workflowName: string): Promise<void> {
	await workflowsDeleteWorkflow({
		path: {
			workflow_name: workflowName,
		},
	});
}
