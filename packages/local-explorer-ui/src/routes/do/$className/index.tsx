import { Button, Link as KumoLink, Table } from "@cloudflare/kumo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
	durableObjectsNamespaceListNamespaces,
	durableObjectsNamespaceListObjects,
} from "../../../api";
import DOIcon from "../../../assets/icons/durable-objects.svg?react";
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
				icon={DOIcon}
				items={[
					<span className="flex items-center gap-1.5" key="class-name">
						{params.className}
						{namespaceId !== params.className && (
							<span className="text-kumo-subtle">({namespaceId})</span>
						)}
					</span>,
				]}
				title="Durable Objects"
			/>

			<div className="px-6 py-6">
				{error && (
					<div className="mb-4 rounded-md border border-kumo-danger/20 bg-kumo-danger/8 p-4 text-kumo-danger">
						{error}
					</div>
				)}

				{loading ? (
					<div className="p-12 text-center text-kumo-subtle">Loading...</div>
				) : objects.length === 0 ? (
					<div className="flex flex-col items-center justify-center space-y-2 p-12 text-center text-kumo-subtle">
						<h2 className="text-2xl font-medium">
							No Durable Objects with stored data
						</h2>
						<p className="text-sm font-light">
							Create a Durable Object with SQLite storage to see it here.
						</p>
					</div>
				) : (
					<>
						<div className="overflow-hidden rounded-lg border border-kumo-fill">
							<Table>
								<Table.Header>
									<Table.Row>
										<Table.Head>Object ID</Table.Head>
										<Table.Head />
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{objects.map((obj) => (
										<Table.Row key={obj.id}>
											<Table.Cell className="font-mono text-xs">
												{obj.id}
											</Table.Cell>
											<Table.Cell className="text-right">
												<Link
													className="inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-xs hover:bg-kumo-fill"
													params={{
														className: params.className,
														objectId: obj.id as string,
													}}
													search={{ table: undefined }}
													to="/do/$className/$objectId"
												>
													Open Studio
													<KumoLink.ExternalIcon />
												</Link>
											</Table.Cell>
										</Table.Row>
									))}
								</Table.Body>
							</Table>
						</div>

						{hasMore && (
							<div className="py-4 text-center">
								<Button
									variant="secondary"
									disabled={loadingMore}
									loading={loadingMore}
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
