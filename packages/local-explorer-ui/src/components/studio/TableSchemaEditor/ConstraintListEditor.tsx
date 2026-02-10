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
import type { StudioTableSchemaChange } from "../../../types/studio";
import type { DragEndEvent } from "@dnd-kit/core";

export function StudioConstraintListEditor({
	value,
	onChange,
}: {
	value: StudioTableSchemaChange;
	onChange: React.Dispatch<React.SetStateAction<StudioTableSchemaChange>>;
}) {
	if (value.constraints.length === 0) {
		return null;
	}

	return (
		<>
			<div className="text-base font-bold my-4">Constraints</div>
			<table className="border-collapse w-full">
				<thead>
					<tr>
						<th className="p-2 border border-border" style={{ width: 40 }}>
							#
						</th>
						<th
							className="p-2 border border-border text-left"
							style={{ width: 100 }}
						>
							Type
						</th>
						<th className="p-2 border border-border text-left"></th>
					</tr>
				</thead>
				<tbody>
					{(value.constraints ?? []).map(
						(constraintChange, constriantIndex) => {
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
															className="p-1 px-2 rounded bg-accent inline-block font-mono border border-color select-none gap-2 items-center"
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
												value={constraint.primaryColumns ?? []}
												onChange={(newPrimaryColumns) => {
													onChange(
														produce(value, (draft) => {
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

function SortableColumnList({
	value,
	onChange,
	disabledRearrange,
}: {
	value: string[];
	onChange: (newValue: string[]) => void;
	disabledRearrange?: boolean;
}) {
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;

			if (!active) {
				return;
			}
			if (!over) {
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
					items={value}
					strategy={verticalListSortingStrategy}
					disabled={disabledRearrange}
				>
					{value.map((columnName) => (
						<SortableColumnItem key={columnName} id={columnName} />
					))}
				</SortableContext>
			</DndContext>
		</div>
	);
}

function SortableColumnItem({ id }: { id: string }) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			className="p-1 px-2 rounded bg-accent inline-block font-mono border border-color cursor-pointer select-none hover:border-active"
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
		>
			{id}
		</div>
	);
}
