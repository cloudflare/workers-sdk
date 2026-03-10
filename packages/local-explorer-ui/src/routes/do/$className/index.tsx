import { Button } from "@base-ui/react/button";
import { CubeIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	durableObjectsNamespaceListNamespaces,
	durableObjectsNamespaceListObjects,
} from "../../../api";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import type { WorkersObject } from "../../../api";

export const Route = createFileRoute("/do/$className/")({
	component: NamespaceView,
	loader: async ({ params }) => {
		const response = await durableObjectsNamespaceListNamespaces();
		const namespaces = response.data?.result ?? [];
		const namespace = namespaces.find(
			(ns) =>
				ns.class === params.className ||
				ns.name === params.className ||
				ns.id === params.className
		);
		if (!namespace?.id) {
			throw new Error(`Durable Object class "${params.className}" not found`);
		}

		const objectsResponse = await durableObjectsNamespaceListObjects({
			path: {
				id: namespace.id,
			},
			query: {
				limit: 50,
			},
		});

		const objects = objectsResponse.data?.result ?? [];
		const cursor = objectsResponse.data?.result_info?.cursor ?? null;

		return {
			cursor,
			hasMore: !!cursor,
			namespaceId: namespace.id,
			objects,
		};
	},
});

function NamespaceView() {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { namespaceId } = loaderData;

	const [cursor, setCursor] = useState<string | null>(loaderData.cursor);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState<boolean>(loaderData.hasMore);
	const [loading, setLoading] = useState<boolean>(false);
	const [loadingMore, setLoadingMore] = useState<boolean>(false);
	const [objects, setObjects] = useState<WorkersObject[]>(loaderData.objects);

	useEffect((): void => {
		setObjects(loaderData.objects);
		setCursor(loaderData.cursor);
		setHasMore(loaderData.hasMore);
		setError(null);
		setLoading(false);
		setLoadingMore(false);
	}, [loaderData]);

	const fetchObjects = useCallback(
		async (nextCursor?: string): Promise<void> => {
			try {
				if (nextCursor) {
					setLoadingMore(true);
				} else {
					setLoading(true);
					setObjects([]);
				}
				setError(null);

				const response = await durableObjectsNamespaceListObjects({
					path: {
						id: namespaceId,
					},
					query: {
						cursor: nextCursor,
						limit: 50,
					},
				});

				const newObjects = response.data?.result ?? [];

				if (nextCursor) {
					setObjects((prev) => [...prev, ...newObjects]);
				} else {
					setObjects(newObjects);
				}

				const newCursor = response.data?.result_info?.cursor;
				setCursor(newCursor ?? null);
				setHasMore(!!newCursor);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch objects"
				);
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[namespaceId]
	);

	function handleLoadMore(): void {
		if (cursor && !loadingMore) {
			void fetchObjects(cursor);
		}
	}

	return (
		<>
			<Breadcrumbs
				icon={CubeIcon}
				items={[
					<span className="flex items-center gap-1.5" key="class-name">
						{params.className}
					</span>,
				]}
				title="Durable Objects"
			/>

			<div className="px-6 py-6">
				{error && (
					<div className="mb-4 rounded-md border border-danger/20 bg-danger/8 p-4 text-danger">
						{error}
					</div>
				)}

				{loading ? (
					<div className="p-12 text-center text-text-secondary">Loading...</div>
				) : objects.length === 0 ? (
					<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-text-secondary">
						<h2 className="text-2xl font-medium">
							No Durable Objects with stored data
						</h2>
						<p className="text-sm font-light">
							Create a Durable Object with SQLite storage to see it here.
						</p>
					</div>
				) : (
					<>
						<div className="overflow-hidden rounded-lg border border-border">
							<table className="w-full text-sm">
								<thead className="bg-bg-secondary">
									<tr>
										<th className="border-b border-border px-4 py-3 text-left font-medium text-text-secondary">
											Object ID
										</th>
										<th className="border-b border-border px-4 py-3 text-right font-medium text-text-secondary" />
									</tr>
								</thead>
								<tbody>
									{objects.map((obj) => (
										<tr
											className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-secondary/50"
											key={obj.id}
										>
											<td className="px-4 py-3 font-mono text-xs">{obj.id}</td>
											<td className="px-4 py-3 text-right">
												<Link
													className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
													params={{
														className: params.className,
														objectId: obj.id as string,
													}}
													search={{ table: undefined }}
													to="/do/$className/$objectId"
												>
													Open Studio
												</Link>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{hasMore && (
							<div className="p-4 text-center">
								<Button
									className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0"
									disabled={loadingMore}
									focusableWhenDisabled
									onClick={handleLoadMore}
								>
									{loadingMore ? "Loading..." : "Load More"}
								</Button>
							</div>
						)}
					</>
				)}
			</div>
		</>
	);
}
