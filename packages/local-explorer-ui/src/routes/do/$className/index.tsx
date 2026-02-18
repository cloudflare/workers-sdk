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
		// Resolve className to namespaceId
		const response = await durableObjectsNamespaceListNamespaces();
		const namespaces = response.data?.result ?? [];
		const namespace = namespaces.find(
			(ns) => ns.class === params.className || ns.name === params.className
		);
		if (!namespace?.id) {
			throw new Error(`Durable Object class "${params.className}" not found`);
		}

		return {
			namespaceId: namespace.id,
		};
	},
});

function NamespaceView() {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { namespaceId } = loaderData;

	const [objects, setObjects] = useState<WorkersObject[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);

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

	useEffect((): void => {
		setError(null);
		void fetchObjects();
	}, [namespaceId, fetchObjects]);

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
					<div className="text-danger p-4 bg-danger/8 border border-danger/20 rounded-md mb-4">
						{error}
					</div>
				)}

				{loading ? (
					<div className="text-center p-12 text-text-secondary">Loading...</div>
				) : objects.length === 0 ? (
					<div className="text-center p-12 text-text-secondary space-y-2 flex flex-col items-center justify-center">
						<h2 className="text-2xl font-medium">
							No Durable Objects with stored data
						</h2>
						<p className="text-sm font-light">
							Create a Durable Object with SQLite storage to see it here.
						</p>
					</div>
				) : (
					<>
						<div className="rounded-lg border border-border overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-bg-secondary">
									<tr>
										<th className="text-left px-4 py-3 font-medium text-text-secondary border-b border-border">
											Object ID
										</th>
										<th className="text-left px-4 py-3 font-medium text-text-secondary border-b border-border">
											Has Stored Data
										</th>
										<th className="text-right px-4 py-3 font-medium text-text-secondary border-b border-border">
											Actions
										</th>
									</tr>
								</thead>
								<tbody>
									{objects.map((obj) => (
										<tr
											className="border-b border-border last:border-b-0 hover:bg-bg-secondary/50 transition-colors"
											key={obj.id}
										>
											<td className="px-4 py-3 font-mono text-xs">{obj.id}</td>
											<td className="px-4 py-3">
												{obj.hasStoredData ? (
													<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
														Yes
													</span>
												) : (
													<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-text-secondary/10 text-text-secondary">
														No
													</span>
												)}
											</td>
											<td className="px-4 py-3 text-right">
												<Link
													className="inline-flex items-center justify-center py-1.5 px-3 text-xs font-medium rounded-md cursor-pointer transition-colors bg-primary text-white hover:bg-primary-hover"
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
							<div className="text-center p-4">
								<Button
									className="inline-flex items-center justify-center py-2 px-4 text-sm font-medium rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-bg-tertiary text-text border border-border hover:bg-border data-disabled:opacity-60 data-disabled:cursor-not-allowed data-disabled:active:translate-y-0"
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
