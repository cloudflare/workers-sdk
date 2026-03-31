import { Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
	d1ListDatabases,
	durableObjectsNamespaceListNamespaces,
	localExplorerListWorkers,
	r2ListBuckets,
	workersKvNamespaceListNamespaces,
	workflowsListWorkflows,
} from "../api";
import { AppShell } from "../components/layout";
import { NotFound } from "../components/NotFound";
import { Sidebar } from "../components/Sidebar";
import { filterVisibleWorkers } from "../components/WorkerSelector";
import { useTheme } from "../hooks/useTheme";
import type {
	D1DatabaseResponse,
	LocalExplorerWorker,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";

// Extended types with workerName for filtering
type KvNamespaceWithWorker = WorkersKvNamespace & { workerName?: string };
type D1DatabaseWithWorker = D1DatabaseResponse & { workerName?: string };
type DoNamespaceWithWorker = WorkersNamespace & { workerName?: string };
type R2BucketWithWorker = R2Bucket & { workerName?: string };
type WorkflowWithWorker = WorkflowsWorkflow & { script_name?: string };

interface WorkerResourceGroup {
	databases: D1DatabaseWithWorker[];
	doNamespaces: DoNamespaceWithWorker[];
	kvNamespaces: KvNamespaceWithWorker[];
	r2Buckets: R2BucketWithWorker[];
	worker: LocalExplorerWorker;
	workflows: WorkflowWithWorker[];
}

export const Route = createRootRoute({
	component: RootLayout,
	notFoundComponent: NotFound,
	loader: async () => {
		const [
			workersResponse,
			kvResponse,
			d1Response,
			doResponse,
			r2Response,
			workflowsResponse,
		] = await Promise.allSettled([
			localExplorerListWorkers(),
			workersKvNamespaceListNamespaces(),
			d1ListDatabases(),
			durableObjectsNamespaceListNamespaces(),
			r2ListBuckets(),
			workflowsListWorkflows(),
		]);

		let workers = new Array<LocalExplorerWorker>();
		if (workersResponse.status === "fulfilled") {
			workers = workersResponse.value.data?.result ?? [];
		}

		let kvNamespaces = new Array<KvNamespaceWithWorker>();
		let kvError: string | null = null;
		if (kvResponse.status === "fulfilled") {
			kvNamespaces = (kvResponse.value.data?.result ??
				[]) as KvNamespaceWithWorker[];
		} else {
			kvError = `KV Error: ${kvResponse.reason instanceof Error ? kvResponse.reason.message : JSON.stringify(kvResponse.reason)}`;
		}

		let databases = new Array<D1DatabaseWithWorker>();
		let d1Error: string | null = null;
		if (d1Response.status === "fulfilled") {
			databases = (d1Response.value.data?.result ??
				[]) as D1DatabaseWithWorker[];
		} else {
			d1Error = `D1 Error: ${d1Response.reason instanceof Error ? d1Response.reason.message : JSON.stringify(d1Response.reason)}`;
		}

		let doNamespaces = new Array<DoNamespaceWithWorker>();
		let doError: string | null = null;
		if (doResponse.status === "fulfilled") {
			// Only show namespaces that use SQLite storage
			const allDoNamespaces = (doResponse.value.data?.result ??
				[]) as DoNamespaceWithWorker[];
			doNamespaces = allDoNamespaces.filter((ns) => ns.use_sqlite === true);
		} else {
			doError = `DO Error: ${doResponse.reason instanceof Error ? doResponse.reason.message : JSON.stringify(doResponse.reason)}`;
		}

		let r2Buckets = new Array<R2BucketWithWorker>();
		let r2Error: string | null = null;
		if (r2Response.status === "fulfilled") {
			r2Buckets = (r2Response.value.data?.result?.buckets ??
				[]) as R2BucketWithWorker[];
		} else {
			r2Error = `R2 Error: ${r2Response.reason instanceof Error ? r2Response.reason.message : JSON.stringify(r2Response.reason)}`;
		}

		let workflows = new Array<WorkflowWithWorker>();
		let workflowsError: string | null = null;
		if (workflowsResponse.status === "fulfilled") {
			workflows = workflowsResponse.value.data?.result ?? [];
		} else {
			workflowsError = `Workflows Error: ${workflowsResponse.reason instanceof Error ? workflowsResponse.reason.message : JSON.stringify(workflowsResponse.reason)}`;
		}

		return {
			d1Error,
			databases,
			doError,
			doNamespaces,
			kvError,
			kvNamespaces,
			r2Buckets,
			r2Error,
			workers,
			workflows,
			workflowsError,
		};
	},
});

function RootLayout() {
	const loaderData = Route.useLoaderData();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	// Filter out internal workers (like __asset-worker__, __router-worker__, etc.)
	const visibleWorkers = useMemo(
		() => filterVisibleWorkers(loaderData.workers),
		[loaderData.workers]
	);

	const workerGroups = useMemo<WorkerResourceGroup[]>(() => {
		const defaultWorkerName =
			visibleWorkers.length === 1 ? visibleWorkers[0]?.name : undefined;

		function belongsToWorker(
			resourceWorkerName: string | undefined,
			workerName: string
		): boolean {
			if (resourceWorkerName) {
				return resourceWorkerName === workerName;
			}

			return defaultWorkerName === workerName;
		}

		return visibleWorkers.map((worker) => ({
			worker,
			databases: loaderData.databases.filter((db) =>
				belongsToWorker(db.workerName, worker.name)
			),
			doNamespaces: loaderData.doNamespaces.filter((ns) =>
				belongsToWorker(ns.workerName, worker.name)
			),
			kvNamespaces: loaderData.kvNamespaces.filter((ns) =>
				belongsToWorker(ns.workerName, worker.name)
			),
			r2Buckets: loaderData.r2Buckets.filter((bucket) =>
				belongsToWorker(bucket.workerName, worker.name)
			),
			workflows: loaderData.workflows.filter((workflow) =>
				belongsToWorker(workflow.script_name, worker.name)
			),
		}));
	}, [
		visibleWorkers,
		loaderData.databases,
		loaderData.doNamespaces,
		loaderData.kvNamespaces,
		loaderData.r2Buckets,
		loaderData.workflows,
	]);

	const theme = useTheme();

	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("sidebar-collapsed") === "true";
		}
		return false;
	});

	const handleToggle = useCallback(() => {
		setSidebarCollapsed((prev) => {
			const next = !prev;
			localStorage.setItem("sidebar-collapsed", String(next));
			return next;
		});
	}, []);

	return (
		<Toasty>
			<AppShell
				sidebar={
					<Sidebar
						collapsed={sidebarCollapsed}
						currentPath={currentPath}
						d1Error={loaderData.d1Error}
						doError={loaderData.doError}
						kvError={loaderData.kvError}
						onThemeToggle={theme.cycleNext}
						onToggle={handleToggle}
						r2Error={loaderData.r2Error}
						resolvedTheme={theme.resolvedTheme}
						themePreference={theme.preference}
						workerGroups={workerGroups}
						workflowsError={loaderData.workflowsError}
					/>
				}
			>
				<Outlet />
			</AppShell>
		</Toasty>
	);
}
