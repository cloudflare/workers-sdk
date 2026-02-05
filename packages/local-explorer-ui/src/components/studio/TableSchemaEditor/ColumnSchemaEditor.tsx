import {
	Button,
	Checkbox,
	cn,
	DropdownMenu,
	Input,
	Label,
	Select,
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
import { Drawer, useModal } from "../../../utils/studio/stubs";
import type {
	StudioTableColumn,
	StudioTableConstraintChange,
	StudioTableSchemaChange,
} from "../../../types/studio";
import type { Icon } from "@phosphor-icons/react";
import type { PropsWithChildren } from "react";

interface StudioColumnSchemaEditorProps {
	value: StudioTableSchemaChange;
	onChange: React.Dispatch<React.SetStateAction<StudioTableSchemaChange>>;
	columnIndex: number;
	highlightSchemaChanges?: boolean;
	readOnlyExistingColumns?: boolean;
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
	value,
	onChange,
	columnIndex,
	highlightSchemaChanges,
	readOnlyExistingColumns,
}: StudioColumnSchemaEditorProps) {
	const { openModal } = useModal();
	const column = value.columns[columnIndex];

	const isPrimaryKey =
		column.new?.constraint?.primaryKey ||
		value.constraints.some((constraint) =>
			(constraint.new?.primaryColumns ?? []).includes(column.new?.name ?? "")
		);

	const editableColumn = column.new;

	const onPrimaryKeyClicked = useCallback(() => {
		if (!editableColumn) {
			return;
		}

		onChange((prev) =>
			produce(prev, (draft) => {
				let pkConstraint = draft.constraints.find((c) => c.new?.primaryKey);

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
				} else {
					// Add column to primary key list or create constraint if none exists
					if (pkConstraint?.new) {
						pkConstraint.new.primaryColumns = [
							...(pkConstraint.new.primaryColumns ?? []),
							editableColumn.name,
						];
					} else {
						draft.constraints.push({
							new: {
								primaryKey: true,
								primaryColumns: [editableColumn.name],
							},
							old: null,
							key: window.crypto.randomUUID(),
						});
					}
				}
			})
		);
	}, [editableColumn, onChange, isPrimaryKey]);

	const onNullClicked = useCallback(
		(checkedState: boolean) => {
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

	const handleEditColumn = useCallback(() => {
		if (!column.new) {
			return;
		}

		openModal(StudioColumnEditiorDrawer, {
			defaultValue: column.new,
			schemaChanges: value,
			onConfirm: (newColumnDef: StudioTableColumn) => {
				onChange((prev) =>
					produce(prev, (draft) => {
						const targetColumn = draft.columns.find(
							(draftColumn) => draftColumn.key === column.key
						);
						if (!targetColumn) {
							return;
						}

						targetColumn.new = newColumnDef;
					})
				);
			},
		});
	}, [onChange, value, column, openModal]);

	const handleRemoveColumn = useCallback(() => {
		onChange((prev) =>
			produce(prev, (draft) => {
				draft.columns = draft.columns.filter((c) => c.key !== column.key);
			})
		);
	}, [onChange, column]);

	if (!column || !editableColumn) {
		return null;
	}

	return (
		<tr
			key={column.key}
			className={
				highlightSchemaChanges && column.new && !column.old
					? "bg-green-100 dark:bg-green-800"
					: ""
			}
		>
			<td
				className={"p-2 border border-border text-center"}
				style={{ height: 40 }}
			>
				{columnIndex + 1}
			</td>
			<td
				className={cn(
					"p-2 border border-border text-center",
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
			<td className="p-2 border border-border font-mono">
				{editableColumn.name}
			</td>
			<td className="p-2 border border-border">{editableColumn.type}</td>
			<td className="p-2 border border-border text-center">
				<Checkbox
					checked={!editableColumn.constraint?.notNull}
					className="mx-auto"
					onValueChange={
						readOnlyExistingColumns && column.old ? undefined : onNullClicked
					}
				/>
			</td>
			<td className="p-2 border border-border font-mono">
				{JSON.stringify(editableColumn.constraint?.defaultValue)}
			</td>
			<td className="p-2 border border-border">
				<ColumnConstraintDescription
					constraints={value.constraints}
					column={editableColumn}
				/>
			</td>
			<td className="p-2 border border-border text-center">
				<DropdownMenu>
					<DropdownMenu.Trigger asChild>
						<Button variant="ghost" size="sm" shape="square">
							<DotsThreeOutlineIcon weight="fill" size={16} />
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="bottom" align="end">
						<DropdownMenu.Item
							disabled={!!column.old}
							icon={PencilIcon}
							onClick={handleEditColumn}
						>
							Edit column
						</DropdownMenu.Item>
						<DropdownMenu.Item
							icon={TrashIcon}
							disabled={!!column.old}
							onClick={handleRemoveColumn}
						>
							Remove column
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>
			</td>
		</tr>
	);
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
}: {
	column: StudioTableColumn;
	constraints: StudioTableConstraintChange[];
}) {
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

function ColumnConstraintBadge({
	children,
	icon: IconComponent,
	name,
}: PropsWithChildren<{ icon?: Icon; name: string }>) {
	return (
		<div className="inline-flex items-center gap-1 border border-border rounded overflow-hidden">
			<div className="bg-accent p-1 border-r border-border flex items-center">
				{IconComponent && <IconComponent className="mr-1" />} {name}
			</div>
			<div className="p-1 font-mono">{children}</div>
		</div>
	);
}

interface StudioColumnEditiorDrawerProps {
	defaultValue?: StudioTableColumn;
	schemaChanges: StudioTableSchemaChange;
	onConfirm: (value: StudioTableColumn) => void;
}

export function StudioColumnEditiorDrawer({
	defaultValue,
	schemaChanges,
	onConfirm,
}: StudioColumnEditiorDrawerProps) {
	const [value, setValue] = useState<StudioTableColumn>(() => {
		return defaultValue
			? structuredClone(defaultValue)
			: {
					name: "",
					type: "",
				};
	});

	const isColumnNameDuplicated = !!schemaChanges.columns.find(
		(column) =>
			column.new !== defaultValue &&
			column.new?.name.toLowerCase() === value.name.toLocaleLowerCase()
	);

	return (
		<Drawer
			title="Add Column"
			children={() => {
				return (
					<div className="flex flex-col gap-2">
						<Label
							title="Column name"
							requiredDescription={"Column name must be unique"}
							required
							isValid={!isColumnNameDuplicated}
						>
							<Input
								className="w-full"
								placeholder="e.g., user_id"
								value={value.name}
								onValueChange={(newColumnName) => {
									setValue(
										produce(value, (draft) => {
											draft.name = newColumnName;
										})
									);
								}}
							/>
						</Label>

						<Label title="Data type" className="w-full" required>
							<Select
								placeholder="Select a type"
								className="w-full"
								value={value.type}
								onChange={(newType) => {
									setValue((prev) =>
										produce(prev, (draft) => {
											draft.type = newType;
										})
									);
								}}
								options={[
									...(["", "TEXT", "INTEGER", "REAL", "BLOB"].includes(
										value.type?.toUpperCase()
									)
										? []
										: [
												{
													label: value.type,
													value: value.type,
												},
											]),
									{ label: "Text", value: "TEXT" },
									{ label: "Integer", value: "INTEGER" },
									{ label: "Real", value: "REAL" },
									{ label: "Blob", value: "BLOB" },
								]}
							/>
						</Label>
					</div>
				);
			}}
			footer={({ onClose }) => {
				return (
					<Button
						disabled={!value.name || !value.type || isColumnNameDuplicated}
						variant="primary"
						onClick={() => {
							onConfirm(value);
							onClose();
						}}
					>
						{defaultValue ? "Save column" : "Add column"}
					</Button>
				);
			}}
		/>
	);
}
