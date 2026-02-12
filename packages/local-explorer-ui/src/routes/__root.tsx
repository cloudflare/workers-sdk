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
	const [kvError, setKvError] = useState<string | null>(null);
	const [d1Error, setD1Error] = useState<string | null>(null);

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	useEffect(() => {
		async function fetchData() {
			const [kvResponse, d1Response] = await Promise.allSettled([
				workersKvNamespaceListNamespaces(),
				cloudflareD1ListDatabases(),
			]);

			if (kvResponse.status === "fulfilled") {
				setNamespaces(kvResponse.value.data?.result ?? []);
			} else {
				setKvError(
					`KV Error: ${kvResponse.reason instanceof Error ? kvResponse.reason.message : JSON.stringify(kvResponse.reason)}`
				);
			}

			if (d1Response.status === "fulfilled") {
				setDatabases(d1Response.value.data?.result ?? []);
			} else {
				setD1Error(
					`D1 Error: ${d1Response.reason instanceof Error ? d1Response.reason.message : JSON.stringify(d1Response.reason)}`
				);
			}

			setLoading(false);
		}
		void fetchData();
	}, []);

	return (
		<div className="flex min-h-screen">
			<Sidebar
				currentPath={currentPath}
				d1Error={d1Error}
				databases={databases}
				kvError={kvError}
				loading={loading}
				namespaces={namespaces}
			/>
			<main className="flex-1 overflow-y-auto flex flex-col">
				<Outlet />
			</main>
		</div>
	);
}
