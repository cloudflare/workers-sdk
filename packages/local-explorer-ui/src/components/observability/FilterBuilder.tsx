import { Button, Dialog, Select } from "@cloudflare/kumo";
import {
	FunnelSimpleIcon,
	PlusIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import {
	clauseOpLabel,
	clauseOpNeedsValue,
	defaultOpForType,
	operatorsForType,
} from "../../utils/observability-query";
import type { ClauseType, QueryClause } from "../../utils/observability-query";
import type { JSX } from "react";

/** A field the modal can build a filter on. */
export interface FilterField {
	key: string;
	label: string;
	type: ClauseType;
}

function defaultOp(type: ClauseType): QueryClause["op"] {
	return defaultOpForType(type);
}

/** A compact type indicator shown next to a field, mirroring the dashboard. */
function TypeBadge({ type }: { type: ClauseType }): JSX.Element {
	return (
		<span className="rounded-sm bg-kumo-fill px-1 font-mono text-[10px] leading-4 text-kumo-subtle uppercase">
			{type === "number" ? "num" : "str"}
		</span>
	);
}

/**
 * A modal filter builder (mirrors the dashboard's Observability query builder)
 * that supports multiple stacked filters, combined with AND. Each field is
 * typed, and the operators offered adapt to that type — string keys get
 * contains / starts with / equals / exists, numeric keys get comparators.
 * Applied filters are shown as removable chips. Emits `QueryClause[]`, the same
 * structured clause shape the query bar parses to, so filters, chips, and
 * search stay in sync.
 */
export function FilterBuilder({
	fields,
	clauses,
	onApply,
	itemNoun = "results",
}: {
	fields: FilterField[];
	clauses: QueryClause[];
	onApply: (clauses: QueryClause[]) => void;
	/** Plural noun used in the dialog copy, e.g. "traces" / "events". */
	itemNoun?: string;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<QueryClause[]>([]);

	const fieldByKey = useCallback(
		(k: string) => fields.find((f) => f.key === k),
		[fields]
	);
	const labelFor = useCallback(
		(k: string) => fieldByKey(k)?.label ?? k,
		[fieldByKey]
	);
	const typeFor = useCallback(
		(k: string): ClauseType => fieldByKey(k)?.type ?? "string",
		[fieldByKey]
	);

	const newRow = useCallback((): QueryClause => {
		const first = fields[0];
		return {
			field: first?.key ?? "",
			op: defaultOp(first?.type ?? "string"),
			value: "",
		};
	}, [fields]);

	const openDialog = useCallback(() => {
		setDraft(clauses.length ? clauses.map((c) => ({ ...c })) : [newRow()]);
		setOpen(true);
	}, [clauses, newRow]);

	const updateRow = (i: number, patch: Partial<QueryClause>) =>
		setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
	const removeRow = (i: number) =>
		setDraft((d) => d.filter((_, idx) => idx !== i));

	const run = () => {
		onApply(
			draft
				.map((r) => ({ ...r, value: r.value.trim() }))
				// Presence operators (exists / does not exist) need no value.
				.filter((r) => r.field && (!clauseOpNeedsValue(r.op) || r.value))
		);
		setOpen(false);
	};

	return (
		<>
			{clauses.map((c, i) => (
				<span
					key={`${c.field}-${c.op}-${i}`}
					className="inline-flex items-center gap-1 rounded-full bg-kumo-fill px-2 py-0.5 text-xs font-medium text-kumo-default"
				>
					<span className="font-mono">{labelFor(c.field)}</span>
					<span className="text-kumo-subtle">{clauseOpLabel(c.op)}</span>
					{clauseOpNeedsValue(c.op) && (
						<span className="font-mono">{c.value}</span>
					)}
					<button
						type="button"
						aria-label={`Remove ${labelFor(c.field)} filter`}
						className="ml-0.5 flex items-center text-kumo-subtle hover:text-kumo-default"
						onClick={() => onApply(clauses.filter((_, idx) => idx !== i))}
					>
						<XIcon size={11} />
					</button>
				</span>
			))}
			<Button
				size="sm"
				variant="ghost"
				icon={FunnelSimpleIcon}
				onClick={openDialog}
			>
				{clauses.length ? `Filters (${clauses.length})` : "Add filter"}
			</Button>

			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog size="lg">
					<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Add filter
						</Dialog.Title>
						<p className="mt-1 text-sm text-kumo-subtle">
							Create one or more filters. Only {itemNoun} matching all of them
							are shown.
						</p>
					</div>

					<div className="flex flex-col gap-2 px-6 py-6">
						{draft.map((row, i) => {
							const type = typeFor(row.field);
							const needsValue = clauseOpNeedsValue(row.op);
							return (
								<div key={i} className="flex items-center gap-2">
									<Select
										aria-label="Field"
										value={row.field}
										onValueChange={(v) => {
											const key = String(v);
											updateRow(i, { field: key, op: defaultOp(typeFor(key)) });
										}}
									>
										{fields.map((f) => (
											<Select.Option key={f.key} value={f.key}>
												{f.label}
											</Select.Option>
										))}
									</Select>
									<TypeBadge type={type} />
									<Select
										aria-label="Operator"
										value={row.op}
										onValueChange={(v) =>
											updateRow(i, { op: String(v) as QueryClause["op"] })
										}
									>
										{operatorsForType(type).map((o) => (
											<Select.Option key={o.op} value={o.op}>
												{o.label}
											</Select.Option>
										))}
									</Select>
									{needsValue ? (
										<input
											className="focus-visible:ring-kumo-ring w-full flex-1 rounded-lg border border-kumo-fill bg-kumo-base px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none focus-visible:ring-2"
											aria-label="Value"
											type={type === "number" ? "number" : "text"}
											value={row.value}
											placeholder="Value…"
											onChange={(e) =>
												updateRow(i, { value: e.currentTarget.value })
											}
										/>
									) : (
										<div className="flex-1" />
									)}
									<Button
										shape="square"
										variant="ghost"
										icon={TrashIcon}
										aria-label="Remove filter"
										disabled={draft.length === 1}
										onClick={() => removeRow(i)}
									/>
								</div>
							);
						})}
						<div>
							<Button
								size="sm"
								variant="ghost"
								icon={PlusIcon}
								onClick={() => setDraft((d) => [...d, newRow()])}
							>
								Add filter
							</Button>
						</div>
					</div>

					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button variant="secondary" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button variant="primary" onClick={run}>
							Run query
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
