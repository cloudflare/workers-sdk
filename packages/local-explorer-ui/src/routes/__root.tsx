import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	cloudflareD1ListDatabases,
	workersKvNamespaceListNamespaces,
} from "../api";
import { Sidebar } from "../components/Sidebar";
import type { D1DatabaseResponse, WorkersKvNamespace } from "../api";

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	const [namespaces, setNamespaces] = useState<WorkersKvNamespace[]>([]);
	const [databases, setDatabases] = useState<D1DatabaseResponse[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	useEffect(() => {
		async function fetchData() {
			try {
				const [kvResponse, d1Response] = await Promise.all([
					workersKvNamespaceListNamespaces(),
					cloudflareD1ListDatabases(),
				]);
				setNamespaces(kvResponse.data?.result ?? []);
				setDatabases(d1Response.data?.result ?? []);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to fetch data");
			} finally {
				setLoading(false);
			}
		}
		void fetchData();
	}, []);

	return (
		<div className="flex min-h-screen">
			<Sidebar
				currentPath={currentPath}
				databases={databases}
				error={error}
				loading={loading}
				namespaces={namespaces}
			/>
			<main className="flex-1 overflow-y-auto flex flex-col">
				<Outlet />
			</main>
		</div>
	);
}
