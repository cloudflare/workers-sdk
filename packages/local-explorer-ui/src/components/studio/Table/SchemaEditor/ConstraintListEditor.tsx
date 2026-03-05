import { closestCenter, DndContext } from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import { useCallback } from "react";
import type { StudioTableSchemaChange } from "../../../../types/studio";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Dispatch, SetStateAction } from "react";

interface StudioConstraintListEditorProps {
	onChange: Dispatch<SetStateAction<StudioTableSchemaChange>>;
	value: StudioTableSchemaChange;
}

export function StudioConstraintListEditor({
	onChange,
	value,
}: StudioConstraintListEditorProps): JSX.Element | null {
	if (value.constraints.length === 0) {
		return null;
	}

	return (
		<>
			<div className="text-base font-bold my-4">Constraints</div>
			<table className="w-full border-collapse">
				<thead>
					<tr>
						<th className="p-2 border border-border h-10 w-12">#</th>
						<th className="p-2 border border-border text-left h-10 w-32">
							Type
						</th>
						<th className="p-2 border border-border text-left"></th>
					</tr>
				</thead>

				<tbody>
					{(value.constraints ?? []).map(
						(constraintChange, constriantIndex): JSX.Element | null => {
							const constraint = constraintChange.new || constraintChange.old;
							if (!constraint) {
								return null;
							}

							let constraintType = "";

							if (constraint.unique) {
								constraintType = "Unique";
							}

							if (constraint.foreignKey) {
								constraintType = "Foreign Key";
							}

							if (constraint.primaryKey) {
								constraintType = "Primary Key";
							}

							if (constraint.checkExpression) {
								constraintType = "Check";
							}

							return (
								<tr key={constriantIndex}>
									<td
										className="p-2 border border-border text-center"
										style={{ height: 40 }}
									>
										{constriantIndex + 1}
									</td>
									<td className="p-2 border border-border">{constraintType}</td>
									<td className="p-2 border border-border">
										{constraint.foreignKey && (
											<div className="flex gap-2">
												{(constraint.foreignKey.columns ?? []).map(
													(column, columnIndex) => (
														<div
															className="p-1 px-2 rounded bg-accent inline-block font-mono border border-border select-none gap-2 items-center"
															key={columnIndex}
														>
															{column} <ArrowRightIcon />{" "}
															{constraint.foreignKey?.foreignTableName}.
															{
																constraint.foreignKey?.foreignColumns?.[
																	columnIndex
																]
															}
														</div>
													)
												)}
											</div>
										)}

										{constraint.primaryKey && (
											<SortableColumnList
												disabledRearrange={!!value.name.old}
												onChange={(newPrimaryColumns) => {
													onChange((prev) =>
														produce(prev, (draft) => {
															draft.constraints.forEach((c) => {
																if (
																	c.key === constraintChange.key &&
																	c.new?.primaryColumns
																) {
																	c.new.primaryColumns = newPrimaryColumns;
																}
															});
														})
													);
												}}
												value={constraint.primaryColumns ?? []}
											/>
										)}
									</td>
								</tr>
							);
						}
					)}
				</tbody>
			</table>
		</>
	);
}

interface SortableColumnListProps {
	disabledRearrange?: boolean;
	onChange: (newValue: string[]) => void;
	value: string[];
}

function SortableColumnList({
	disabledRearrange,
	onChange,
	value,
}: SortableColumnListProps): JSX.Element {
	const handleDragEnd = useCallback(
		(event: DragEndEvent): void => {
			const { active, over } = event;

			if (!active || !over) {
				return;
			}

			if (active.id !== over.id) {
				const oldIndex = value.indexOf(active.id.toString());
				const newIndex = value.indexOf(over.id.toString());
				onChange(arrayMove(value, oldIndex, newIndex));
			}
		},
		[onChange, value]
	);

	return (
		<div className="flex gap-2">
			<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext
					disabled={disabledRearrange}
					items={value}
					strategy={verticalListSortingStrategy}
				>
					{value.map((columnName) => (
						<SortableColumnItem key={columnName} id={columnName} />
					))}
				</SortableContext>
			</DndContext>
		</div>
	);
}

interface SortableColumnItemProps {
	id: string;
}

function SortableColumnItem({ id }: SortableColumnItemProps): JSX.Element {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });

	return (
		<div
			className="p-1 px-2 rounded bg-accent inline-block font-mono border border-border cursor-pointer select-none hover:border-active"
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			{...attributes}
			{...listeners}
		>
			{id}
		</div>
	);
}
