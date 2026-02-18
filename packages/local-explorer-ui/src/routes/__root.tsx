import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	cloudflareD1ListDatabases,
	durableObjectsNamespaceListNamespaces,
	workersKvNamespaceListNamespaces,
} from "../api";
import { Sidebar } from "../components/Sidebar";
import type {
	D1DatabaseResponse,
	WorkersKvNamespace,
	WorkersNamespace,
} from "../api";

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	const [loading, setLoading] = useState<boolean>(true);

	const [kvNamespaces, setKvNamespaces] = useState<WorkersKvNamespace[]>([]);
	const [kvError, setKvError] = useState<string | null>(null);

	const [d1Error, setD1Error] = useState<string | null>(null);
	const [databases, setDatabases] = useState<D1DatabaseResponse[]>([]);

	const [doNamespaces, setDoNamespaces] = useState<WorkersNamespace[]>([]);
	const [doError, setDoError] = useState<string | null>(null);

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	useEffect(() => {
		async function fetchData() {
			const [kvResponse, d1Response, doResponse] = await Promise.allSettled([
				workersKvNamespaceListNamespaces(),
				cloudflareD1ListDatabases(),
				durableObjectsNamespaceListNamespaces(),
			]);

			if (kvResponse.status === "fulfilled") {
				setKvNamespaces(kvResponse.value.data?.result ?? []);
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

			if (doResponse.status === "fulfilled") {
				// Only show namespaces that use SQLite storage
				const allDoNamespaces = doResponse.value.data?.result ?? [];
				setDoNamespaces(allDoNamespaces.filter((ns) => ns.use_sqlite === true));
			} else {
				setDoError(
					`DO Error: ${doResponse.reason instanceof Error ? doResponse.reason.message : JSON.stringify(doResponse.reason)}`
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
				doError={doError}
				doNamespaces={doNamespaces}
				kvError={kvError}
				kvNamespaces={kvNamespaces}
				loading={loading}
			/>
			<main className="flex-1 overflow-y-auto flex flex-col">
				<Outlet />
			</main>
		</div>
	);
}
