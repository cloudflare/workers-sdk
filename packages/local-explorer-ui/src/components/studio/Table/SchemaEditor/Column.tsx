import {
	Button,
	Checkbox,
	cn,
	Dialog,
	DropdownMenu,
	Label,
} from "@cloudflare/kumo";
import {
	ArrowLineDownRightIcon,
	CheckIcon,
	DotsThreeOutlineIcon,
	KeyIcon,
	PencilIcon,
	SigmaIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { produce } from "immer";
import { useCallback, useState } from "react";
import { useModal } from "../../Modal";
import type {
	StudioTableColumn,
	StudioTableConstraintChange,
	StudioTableSchemaChange,
} from "../../../../types/studio";
import type { Icon } from "@phosphor-icons/react";
import type { Dispatch, PropsWithChildren, SetStateAction } from "react";

interface StudioColumnSchemaEditorProps {
	columnIndex: number;
	highlightSchemaChanges?: boolean;
	onChange: Dispatch<SetStateAction<StudioTableSchemaChange>>;
	readOnlyExistingColumns?: boolean;
	value: StudioTableSchemaChange;
}

/**
 * Renders a single editable row in the table schema editor for a specific column.
 *
 * Features:
 * - Toggle primary key participation via icon button
 * - Toggle NULL/NOT NULL via checkbox
 * - Displays column name, type, default value, and constraints
 * - Provides dropdown menu for editing or removing the column
 *
 * It uses immutable updates with `produce` to keep the parent schema state consistent.
 */
export function StudioColumnSchemaEditor({
	columnIndex,
	highlightSchemaChanges,
	onChange,
	readOnlyExistingColumns,
	value,
}: StudioColumnSchemaEditorProps): JSX.Element | null {
	const { openModal } = useModal();
	const column = value.columns[columnIndex];

	const isPrimaryKey =
		column?.new?.constraint?.primaryKey ||
		value.constraints.some((constraint) =>
			(constraint.new?.primaryColumns ?? []).includes(column?.new?.name ?? "")
		);

	const editableColumn = column?.new;

	const onPrimaryKeyClicked = useCallback((): void => {
		if (!editableColumn) {
			return;
		}

		onChange((prev) =>
			produce(prev, (draft) => {
				const pkConstraint = draft.constraints.find((c) => c.new?.primaryKey);

				if (isPrimaryKey) {
					// Remove column from primary key list
					if (pkConstraint?.new?.primaryColumns) {
						pkConstraint.new.primaryColumns =
							pkConstraint.new.primaryColumns.filter(
								(name) => name !== editableColumn.name
							);

						if (pkConstraint.new.primaryColumns.length === 0) {
							draft.constraints = draft.constraints.filter(
								(c) => c.key !== pkConstraint?.key
							);
						}
					}
					return;
				}

				// Add column to primary key list or create constraint if none exists
				if (pkConstraint?.new) {
					pkConstraint.new.primaryColumns = [
						...(pkConstraint.new.primaryColumns ?? []),
						editableColumn.name,
					];
					return;
				}

				draft.constraints.push({
					new: {
						primaryKey: true,
						primaryColumns: [editableColumn.name],
					},
					old: null,
					key: window.crypto.randomUUID(),
				});
			})
		);
	}, [editableColumn, onChange, isPrimaryKey]);

	const onNullClicked = useCallback(
		(checkedState: boolean): void => {
			if (!column) {
				return;
			}

			onChange((prev) =>
				produce(prev, (draft) => {
					const draftColumn = draft.columns.find((c) => c.key === column.key);
					if (!draftColumn?.new) {
						return;
					}

					if (!draftColumn.new.constraint) {
						draftColumn.new.constraint = {};
					}

					draftColumn.new.constraint.notNull = !checkedState;
				})
			);
		},
		[column, onChange]
	);

	const handleEditColumn = useCallback((): void => {
		if (!column?.new) {
			return;
		}

		openModal(StudioColumnEditorModal, {
			defaultValue: column.new,
			onConfirm: (newColumnDef: StudioTableColumn) => {
				onChange((prev) =>
					produce(prev, (draft) => {
						const targetColumn = draft.columns.find(
							(draftColumn) => draftColumn.key === column?.key
						);
						if (!targetColumn) {
							return;
						}

						targetColumn.new = newColumnDef;
					})
				);
			},
			schemaChanges: value,
		});
	}, [onChange, value, column, openModal]);

	const handleRemoveColumn = useCallback((): void => {
		onChange((prev) =>
			produce(prev, (draft) => {
				draft.columns = draft.columns.filter((c) => c.key !== column?.key);
			})
		);
	}, [onChange, column]);

	if (!column || !editableColumn) {
		return null;
	}

	return (
		<tr
			className={
				highlightSchemaChanges && column.new && !column.old
					? "bg-kumo-success/20"
					: ""
			}
			key={column.key}
		>
			<td className="h-10 border border-kumo-fill p-2 text-center">
				{columnIndex + 1}
			</td>

			<td
				className={cn(
					"border border-kumo-fill p-2 text-center",
					!readOnlyExistingColumns && "cursor-pointer"
				)}
				onClick={!readOnlyExistingColumns ? onPrimaryKeyClicked : undefined}
			>
				{isPrimaryKey ? (
					<KeyIcon weight="bold" className="text-blue-500" />
				) : (
					!readOnlyExistingColumns && (
						<KeyIcon className="opacity-25 hover:opacity-100" />
					)
				)}
			</td>

			<td className="border border-kumo-fill p-2 font-mono">
				{editableColumn.name}
			</td>

			<td className="border border-kumo-fill p-2">{editableColumn.type}</td>

			<td className="border border-kumo-fill p-2 text-center">
				<Checkbox
					aria-label="Is nullable"
					checked={!editableColumn.constraint?.notNull}
					className="mx-auto"
					onCheckedChange={
						readOnlyExistingColumns && column.old ? undefined : onNullClicked
					}
				/>
			</td>

			<td className="border border-kumo-fill p-2 font-mono">
				{JSON.stringify(editableColumn.constraint?.defaultValue)}
			</td>

			<td className="border border-kumo-fill p-2">
				<ColumnConstraintDescription
					column={editableColumn}
					constraints={value.constraints}
				/>
			</td>

			<td className="border border-kumo-fill p-2 text-center">
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button
								aria-label="Column options"
								shape="square"
								size="sm"
								variant="ghost"
							>
								<DotsThreeOutlineIcon weight="fill" size={16} />
							</Button>
						}
					/>

					<DropdownMenu.Content side="bottom" align="end">
						<DropdownMenu.Item
							disabled={!!column.old}
							icon={PencilIcon}
							onClick={handleEditColumn}
						>
							Edit column
						</DropdownMenu.Item>

						<DropdownMenu.Item
							disabled={!!column.old}
							icon={TrashIcon}
							onClick={handleRemoveColumn}
							variant="danger"
						>
							Remove column
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>
			</td>
		</tr>
	);
}

interface ColumnConstraintDescriptionProps {
	column: StudioTableColumn;
	constraints: StudioTableConstraintChange[];
}

/**
 * Displays constraint badges for a specific column, including:
 * - Inline column constraints such as CHECK and GENERATED expressions
 * - Foreign key references, whether defined directly on the column or
 *   as part of a table-level constraint that involves the column
 *
 * The component checks both column-level and table-level constraints
 * to accurately resolve foreign key references for display.
 */
function ColumnConstraintDescription({
	column,
	constraints,
}: ColumnConstraintDescriptionProps): JSX.Element {
	// Check if it contains foreign key
	let referenceTableName = column.constraint?.foreignKey?.foreignTableName;
	let referenceColumnName = column.constraint?.foreignKey?.foreignColumns?.[0];

	// Check if the reference is inside the table constraint
	for (const constraint of constraints ?? []) {
		const tableConstraint = constraint?.new;

		if (
			tableConstraint &&
			tableConstraint.foreignKey &&
			tableConstraint.foreignKey.columns &&
			tableConstraint.foreignKey.foreignColumns
		) {
			const foundIndex = tableConstraint.foreignKey.columns.indexOf(
				column.name
			);

			if (foundIndex >= 0) {
				referenceTableName = tableConstraint.foreignKey.foreignTableName;
				referenceColumnName =
					tableConstraint.foreignKey.foreignColumns[foundIndex];
			}
		}
	}

	return (
		<div className="flex flex-wrap gap-2">
			{column.constraint?.generatedExpression && (
				<ColumnConstraintBadge icon={SigmaIcon} name="Generated">
					{column.constraint.generatedExpression}
				</ColumnConstraintBadge>
			)}

			{column.constraint?.checkExpression && (
				<ColumnConstraintBadge icon={CheckIcon} name="Check">
					{column.constraint.checkExpression}
				</ColumnConstraintBadge>
			)}

			{referenceTableName && referenceColumnName && (
				<ColumnConstraintBadge icon={ArrowLineDownRightIcon} name="Reference">
					{referenceTableName}.{referenceColumnName}
				</ColumnConstraintBadge>
			)}
		</div>
	);
}

interface ColumnConstraintBadgeProps extends PropsWithChildren {
	icon?: Icon;
	name: string;
}

function ColumnConstraintBadge({
	children,
	icon: IconComponent,
	name,
}: ColumnConstraintBadgeProps): JSX.Element {
	return (
		<div className="inline-flex items-center gap-1 overflow-hidden rounded border border-kumo-fill">
			<div className="flex items-center border-r border-kumo-fill bg-kumo-overlay p-1">
				{IconComponent && <IconComponent className="mr-1" />} {name}
			</div>

			<div className="p-1 font-mono">{children}</div>
		</div>
	);
}

interface StudioColumnEditiorDrawerProps {
	closeModal?: () => void;
	defaultValue?: StudioTableColumn;
	isOpen?: boolean;
	onConfirm: (value: StudioTableColumn) => void;
	schemaChanges: StudioTableSchemaChange;
}

export function StudioColumnEditorModal({
	closeModal,
	defaultValue,
	isOpen,
	onConfirm,
	schemaChanges,
}: StudioColumnEditiorDrawerProps): JSX.Element {
	const [value, setValue] = useState<StudioTableColumn>(() =>
		defaultValue
			? structuredClone(defaultValue)
			: {
					name: "",
					type: "",
				}
	);

	const isColumnNameDuplicated = !!schemaChanges.columns.find(
		(column) =>
			column.new !== defaultValue &&
			column.new?.name.toLowerCase() === value.name.toLowerCase()
	);

	const isValid = !!value.name && !!value.type && !isColumnNameDuplicated;

	const handleSubmit = (): void => {
		if (!isValid) {
			return;
		}

		onConfirm(value);
		closeModal?.();
	};

	return (
		<Dialog.Root
			onOpenChange={(open: boolean) => {
				if (!open) {
					closeModal?.();
				}
			}}
			open={isOpen}
		>
			<Dialog className="p-6">
				<div className="mb-4 flex items-start justify-between gap-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold">
						{defaultValue ? "Edit Column" : "Add Column"}
					</Dialog.Title>
				</div>

				{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
				<Dialog.Description className="text-kumo-subtle">
					{defaultValue
						? "Edit the column details below."
						: "Enter the column details below."}
				</Dialog.Description>

				<div className="mt-4 flex flex-col gap-4">
					<div>
						<Label
							tooltip={
								isColumnNameDuplicated
									? "Column name must be unique"
									: undefined
							}
						>
							Column name
						</Label>
						<input
							autoFocus
							className="w-full rounded-md border border-kumo-fill bg-transparent px-3 py-2 text-sm"
							onChange={(e): void => {
								setValue(
									produce(value, (draft) => {
										draft.name = e.target.value;
									})
								);
							}}
							placeholder="e.g., user_id"
							value={value.name}
						/>
					</div>

					<div className="w-full">
						<Label>Data type</Label>
						<select
							className="w-full rounded-md border border-kumo-fill bg-transparent px-3 py-2 text-sm"
							onChange={(e): void => {
								const newType = e.target.value;
								if (!newType) {
									return;
								}
								setValue((prev) =>
									produce(prev, (draft) => {
										draft.type = newType;
									})
								);
							}}
							value={value.type}
						>
							<option value="">Select a type</option>
							{value.type &&
								!["TEXT", "INTEGER", "REAL", "BLOB"].includes(
									value.type.toUpperCase()
								) && <option value={value.type}>{value.type}</option>}
							<option value="TEXT">Text</option>
							<option value="INTEGER">Integer</option>
							<option value="REAL">Real</option>
							<option value="BLOB">Blob</option>
						</select>
					</div>
				</div>

				<div className="mt-6 flex justify-end gap-2">
					<Button onClick={closeModal} variant="secondary">
						Cancel
					</Button>
					<Button disabled={!isValid} onClick={handleSubmit} variant="primary">
						{defaultValue ? "Save column" : "Add column"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
