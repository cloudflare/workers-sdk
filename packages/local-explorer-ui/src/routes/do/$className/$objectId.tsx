import { Button, Breadcrumbs as KumoBreadcrumbs } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { durableObjectsNamespaceListNamespaces } from "../../../api";
import DOIcon from "../../../assets/icons/durable-objects.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { Studio } from "../../../components/studio";
import { DropTableConfirmationModal } from "../../../components/studio/Modal/DropTableConfirmation";
import { StudioTableActionsDropdown } from "../../../components/studio/Table/ActionsDropdown";
import { TableSelect } from "../../../components/TableSelect";
import { LocalDODriver } from "../../../drivers/do";
import type { StudioRef } from "../../../components/studio";
import type { StudioResource } from "../../../types/studio";

/**
 * Checks if a string is a valid 64-character hex Durable Object ID.
 */
function isHexId(str: string): boolean {
	return /^[0-9a-f]{64}$/i.test(str);
}

export const Route = createFileRoute("/do/$className/$objectId")({
	component: ObjectView,
	errorComponent: ResourceError,
	loader: async ({ params }) => {
		// Resolve className to a namespace ID
		const response = await durableObjectsNamespaceListNamespaces();
		const namespaces = response.data?.result ?? [];
		const namespace = namespaces.find(
			(ns) =>
				ns.class === params.className ||
				ns.name === params.className ||
				ns.id === params.className
		);
		if (!namespace?.id) {
			throw notFound();
		}

		// Determine if the param is a hex ID or a name
		const isId = isHexId(params.objectId);
		const objectId = isId ? params.objectId : null;
		const objectName = isId ? null : params.objectId;

		// Fetch tables using the resolved namespace ID
		const driver = new LocalDODriver(namespace.id, objectId, objectName);
		const schemas = await driver.schemas();
		const mainSchema = schemas["main"] ?? [];
		const tables = mainSchema
			.filter((item) => item.type === "table" || item.type === "view")
			.map((t) => ({ label: t.name, value: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return {
			isId,
			namespaceId: namespace.id,
			objectId,
			objectName,
			tables,
		};
	},
	notFoundComponent: NotFound,
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

function ObjectView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { namespaceId, objectId, objectName } = loaderData;
	const searchParams = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();

	const lastSyncedTable = useRef<string | undefined>(searchParams.table);
	const studioRef = useRef<StudioRef>(null);

	const [currentTable, setCurrentTable] = useState<string | undefined>(
		searchParams.table
	);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [deleteTarget, setDeleteTarget] = useState<{
		schemaName: string;
		tableName: string;
	} | null>(null);

	const driver = useMemo<LocalDODriver>(
		() => new LocalDODriver(namespaceId, objectId, objectName),
		[namespaceId, objectId, objectName]
	);

	const resource = useMemo<StudioResource>(
		() => ({
			namespaceId,
			objectId: params.objectId,
			type: "do",
		}),
		[namespaceId, params.objectId]
	);

	const handleTableChange = useCallback(
		(tableName: string | undefined) => {
			setCurrentTable(tableName);

			// Skip URL navigation if the table hasn't changed
			if (lastSyncedTable.current === tableName) {
				return;
			}

			lastSyncedTable.current = tableName;

			void navigate({
				replace: true,
				search: (prev) => ({ ...prev, table: tableName }),
				to: ".",
			});
		},
		[navigate]
	);

	const handleTableRefresh = useCallback(async (): Promise<void> => {
		setIsRefreshing(true);
		try {
			// Route invalidation can often be so quick the loading state doesn't show
			// so we add an artificial delay to ensure the user see's something happen.
			await Promise.all([
				router.invalidate(),
				studioRef.current?.refreshSchema(),
				new Promise((resolve) => setTimeout(resolve, 250)),
			]);
		} finally {
			setIsRefreshing(false);
		}
	}, [router]);

	const handleTableDeleted = useCallback(async (): Promise<void> => {
		await handleTableRefresh();
		void navigate({
			replace: true,
			search: (prev) => ({ ...prev, table: undefined }),
			to: ".",
		});
	}, [handleTableRefresh, navigate]);

	const handleDeleteClick = useCallback((): void => {
		if (!currentTable) {
			return;
		}

		setDeleteTarget({
			schemaName: "main",
			tableName: currentTable,
		});
	}, [currentTable]);

	const handleCloseDeleteModal = useCallback((): void => {
		setDeleteTarget(null);
	}, []);

	const handleDeleteSuccess = useCallback((): void => {
		if (!deleteTarget) {
			return;
		}

		studioRef.current?.closeTableTabs(
			deleteTarget.schemaName,
			deleteTarget.tableName
		);
		void handleTableDeleted();
	}, [deleteTarget, handleTableDeleted]);

	// Truncate the object ID for display
	const shortObjectId =
		params.objectId.length > 16
			? `${params.objectId.slice(0, 8)}...${params.objectId.slice(-8)}`
			: params.objectId;

	return (
		<div className="flex h-full flex-col">
			<Breadcrumbs
				icon={DOIcon}
				items={[
					<Link
						className="flex items-center gap-1.5"
						key="class-name"
						params={{ className: params.className }}
						to="/do/$className"
					>
						{params.className}
					</Link>,
					<span
						className="flex items-center gap-1 font-mono text-xs [&_button]:opacity-100"
						key="object-id"
						title={params.objectId}
					>
						{shortObjectId}
						<KumoBreadcrumbs.Clipboard text={params.objectId} />
					</span>,
					<TableSelect
						key="table-selector"
						selectedTable={searchParams.table}
						studioRef={studioRef}
						tables={loaderData.tables}
					/>,
				]}
				title="Durable Objects"
			>
				<div className="flex-1" />

				<Button
					aria-label="Refresh tables"
					className="disabled:cursor-progress"
					disabled={isRefreshing}
					onClick={handleTableRefresh}
					shape="square"
				>
					<ArrowsCounterClockwiseIcon
						className={isRefreshing ? "animate-spin" : undefined}
						size={14}
					/>
				</Button>

				<StudioTableActionsDropdown
					currentTable={currentTable}
					driver={driver}
				/>

				<Button
					aria-label="Edit table schema"
					disabled={!currentTable}
					icon={PencilIcon}
					onClick={(): void => {
						if (currentTable) {
							studioRef.current?.openEditTableTab("main", currentTable);
						}
					}}
				>
					Edit Schema
				</Button>

				<Button
					aria-label="Delete table"
					disabled={!currentTable}
					icon={TrashIcon}
					onClick={handleDeleteClick}
					variant="secondary-destructive"
				>
					Delete Table
				</Button>
			</Breadcrumbs>

			{deleteTarget && (
				<DropTableConfirmationModal
					closeModal={handleCloseDeleteModal}
					driver={driver}
					isOpen={true}
					onSuccess={handleDeleteSuccess}
					schemaName={deleteTarget.schemaName}
					tableName={deleteTarget.tableName}
				/>
			)}

			<div className="flex-1 overflow-hidden">
				<Studio
					driver={driver}
					initialTable={searchParams.table}
					key={`${namespaceId}-${params.objectId}`}
					onTableChange={handleTableChange}
					ref={studioRef}
					resource={resource}
				/>
			</div>
		</div>
	);
}
