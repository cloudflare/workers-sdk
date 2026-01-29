import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { workersKvNamespaceListNamespaces } from "../api";
import { Sidebar } from "../components/Sidebar";
import type { WorkersKvNamespace } from "../api";

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	const [namespaces, setNamespaces] = useState<WorkersKvNamespace[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	useEffect(() => {
		async function fetchNamespaces() {
			try {
				const response = await workersKvNamespaceListNamespaces();
				setNamespaces(response.data?.result ?? []);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch namespaces"
				);
			} finally {
				setLoading(false);
			}
		}
		void fetchNamespaces();
	}, []);

	return (
		<div className="layout">
			<Sidebar
				namespaces={namespaces}
				loading={loading}
				error={error}
				currentPath={currentPath}
			/>
			<main className="main-content">
				<Outlet />
			</main>
		</div>
	);
}
