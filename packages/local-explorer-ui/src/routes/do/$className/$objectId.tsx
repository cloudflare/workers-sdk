import { Select } from "@base-ui/react/select";
import { Button } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	CaretUpDownIcon,
	CheckIcon,
	CubeIcon,
	PencilIcon,
	PlusIcon,
	TableIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { durableObjectsNamespaceListNamespaces } from "../../../api";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { Studio } from "../../../components/studio";
import { DropTableConfirmationModal } from "../../../components/studio/Modal/DropTableConfirmation";
import { StudioTableActionsDropdown } from "../../../components/studio/Table/ActionsDropdown";
import { LocalDODriver } from "../../../drivers/do";
import type { StudioRef } from "../../../components/studio";
import type { StudioResource } from "../../../types/studio";
import type { RefObject } from "react";

export const Route = createFileRoute("/do/$className/$objectId")({
	component: ObjectView,
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
			throw new Error(`Durable Object class "${params.className}" not found`);
		}

		// Fetch tables using the resolved namespace ID
		const driver = new LocalDODriver(namespace.id, params.objectId);
		const schemas = await driver.schemas();
		const mainSchema = schemas["main"] ?? [];
		const tables = mainSchema
			.filter((item) => item.type === "table" || item.type === "view")
			.map((t) => ({ label: t.name, value: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return {
			namespaceId: namespace.id,
			tables,
		};
	},
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

function ObjectView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
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

	const { namespaceId } = loaderData;

	const driver = useMemo<LocalDODriver>(
		() => new LocalDODriver(namespaceId, params.objectId),
		[namespaceId, params.objectId]
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
				search: {
					table: tableName,
				},
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
			search: {
				table: undefined,
			},
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
		<div className="flex flex-col h-full">
			<Breadcrumbs
				icon={CubeIcon}
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
						className="flex items-center gap-1.5 font-mono text-xs"
						key="object-id"
						title={params.objectId}
					>
						{shortObjectId}
					</span>,
					<TableSelect key="table-selector" studioRef={studioRef} />,
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

interface TableSelectProps {
	studioRef: RefObject<StudioRef | null>;
}

function TableSelect({ studioRef }: TableSelectProps): JSX.Element {
	const data = Route.useLoaderData();
	const navigate = useNavigate();
	const searchParams = Route.useSearch();
	const [open, setOpen] = useState(false);

	const handleTableChange = useCallback(
		(tableName: string | null) => {
			if (tableName === null) {
				return;
			}

			void navigate({
				search: {
					table: tableName,
				},
				to: ".",
			});
		},
		[navigate]
	);

	const handleCreateTable = useCallback((): void => {
		setOpen(false);
		studioRef.current?.openCreateTableTab();
	}, [studioRef]);

	return (
		<Select.Root
			key="table-select"
			onOpenChange={setOpen}
			onValueChange={handleTableChange}
			open={open}
			value={searchParams.table ?? null}
		>
			<Select.Trigger className="inline-flex items-center gap-1 p-2 -mx-1.5 rounded-md bg-transparent text-sm text-text cursor-pointer border-none transition-colors hover:bg-border/50 data-popup-open:bg-border/50">
				<Select.Value placeholder="Select table" />
				<Select.Icon>
					<CaretUpDownIcon className="w-3.5 h-3.5 text-text-secondary" />
				</Select.Icon>
			</Select.Trigger>

			<Select.Portal>
				<Select.Positioner
					align="start"
					alignItemWithTrigger={false}
					side="bottom"
					sideOffset={4}
				>
					<Select.Popup className="min-w-36 max-h-72 bg-bg border border-border rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-100 overflow-hidden transition-[opacity,transform] duration-150 data-starting-style:opacity-0 data-starting-style:-translate-y-1 data-ending-style:opacity-0 data-ending-style:-translate-y-1">
						<div className="p-1">
							<button
								className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-sm text-text cursor-pointer transition-colors select-none outline-none hover:bg-bg-secondary dark:hover:bg-bg-tertiary"
								onClick={handleCreateTable}
								type="button"
							>
								<span className="flex items-center w-4">
									<PlusIcon className="w-3.5 h-3.5" />
								</span>
								Create table
							</button>
						</div>

						<div className="mx-1 border-t border-border" />

						<Select.List className="p-1">
							{data.tables.length > 0 ? (
								data.tables.map((table) => {
									const Icon =
										searchParams.table === table.value ? CheckIcon : TableIcon;

									return (
										<Select.Item
											className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-sm text-text cursor-pointer transition-colors select-none outline-none data-highlighted:bg-bg-secondary dark:data-highlighted:bg-bg-tertiary"
											key={table.value}
											value={table.value}
										>
											<span className="flex items-center w-4">
												<Icon className="w-3.5 h-3.5" />
											</span>
											<Select.ItemText>{table.label}</Select.ItemText>
										</Select.Item>
									);
								})
							) : (
								<span className="flex justify-center items-center gap-2 w-full py-1.5 px-2 text-sm text-text-secondary">
									No tables
								</span>
							)}
						</Select.List>
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}
