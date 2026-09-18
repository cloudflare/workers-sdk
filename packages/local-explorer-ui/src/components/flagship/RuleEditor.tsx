import {
	Banner,
	Button,
	ChartPalette,
	InputArea,
	Label,
	Select,
} from "@cloudflare/kumo";
import {
	CaretDownIcon,
	CaretUpIcon,
	PercentIcon,
	PlusIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import {
	alignSplits,
	evenSplits,
	FLAGSHIP_OPERATOR_LABELS,
	type DefaultServeDraft,
	type FlagshipOperator,
	type RuleConditionDraft,
	type RuleDraft,
	type VariationDraft,
} from "./flag-helpers";
import { Field, TextInput } from "./FormFields";
import type { JSX } from "react";

interface RuleEditorProps {
	defaultServe: DefaultServeDraft;
	defaultVariationId: string;
	disabled: boolean;
	error?: string;
	onChange: (rules: RuleDraft[]) => void;
	onDefaultServeChange: (defaultServe: DefaultServeDraft) => void;
	rules: RuleDraft[];
	splitError?: string;
	variations: VariationDraft[];
}

interface ConditionGroup {
	conditions: RuleConditionDraft[];
	startIndex: number;
}

function newCondition(joinOperator: "AND" | "OR" = "AND"): RuleConditionDraft {
	return {
		attribute: "",
		id: crypto.randomUUID(),
		joinOperator,
		operator: "equals",
		value: "",
		valueEdited: false,
	};
}

function groupConditions(conditions: RuleConditionDraft[]): ConditionGroup[] {
	const groups: ConditionGroup[] = [];
	for (const [index, condition] of conditions.entries()) {
		if (index === 0 || condition.joinOperator === "AND") {
			groups.push({ conditions: [condition], startIndex: index });
		} else {
			groups.at(-1)?.conditions.push(condition);
		}
	}
	return groups;
}

function ConditionRow({
	condition,
	disabled,
	label,
	onChange,
	onRemove,
}: {
	condition: RuleConditionDraft;
	disabled: boolean;
	label: "IF" | "OR";
	onChange: (condition: RuleConditionDraft) => void;
	onRemove: () => void;
}): JSX.Element {
	const listOperator =
		condition.operator === "in" || condition.operator === "not_in";
	const numericOperator = [
		"greater_than",
		"greater_than_or_equals",
		"less_than",
		"less_than_or_equals",
	].includes(condition.operator);

	function changeOperator(operator: FlagshipOperator): void {
		onChange({ ...condition, operator });
	}

	return (
		<div className="grid grid-cols-[2rem_minmax(0,1fr)_2.25rem] items-start gap-2">
			<span className="pt-2.5 text-xs font-semibold text-kumo-subtle">
				{label}
			</span>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)_minmax(0,1fr)]">
				<TextInput
					ariaLabel="Attribute"
					disabled={disabled}
					onValueChange={(attribute) => onChange({ ...condition, attribute })}
					placeholder="Attribute, e.g. plan"
					value={condition.attribute}
				/>
				<Select
					aria-label="Operator"
					className="w-full"
					disabled={disabled}
					items={FLAGSHIP_OPERATOR_LABELS}
					onValueChange={(operator) =>
						changeOperator(String(operator) as FlagshipOperator)
					}
					value={condition.operator}
				>
					{Object.entries(FLAGSHIP_OPERATOR_LABELS).map(
						([value, labelText]) => (
							<Select.Option key={value} value={value}>
								{labelText}
							</Select.Option>
						)
					)}
				</Select>
				{listOperator ? (
					<InputArea
						aria-label="Value"
						className="min-h-9 resize-y font-mono text-sm"
						disabled={disabled}
						onChange={(event) =>
							onChange({
								...condition,
								value: event.target.value,
								valueEdited: true,
							})
						}
						placeholder={"One value per line\npro\nenterprise"}
						rows={2}
						value={condition.value}
					/>
				) : (
					<TextInput
						ariaLabel="Value"
						disabled={disabled}
						onValueChange={(value) =>
							onChange({ ...condition, value, valueEdited: true })
						}
						placeholder={numericOperator ? "Number or ISO date" : "Value"}
						value={condition.value}
					/>
				)}
			</div>
			<Button
				aria-label="Remove condition"
				className="text-kumo-subtle hover:text-kumo-danger"
				disabled={disabled}
				icon={<TrashIcon size={14} />}
				onClick={onRemove}
				shape="square"
				variant="ghost"
			/>
		</div>
	);
}

function variationItems(
	variations: VariationDraft[],
	defaultVariationId: string
): Record<string, string> {
	return Object.fromEntries(
		variations.map((variation) => [
			variation.id,
			variation.id === defaultVariationId
				? `${variation.name} (default)`
				: variation.name,
		])
	);
}

function RuleCard({
	defaultVariationId,
	disabled,
	ruleIndex,
	onChange,
	onMove,
	onRemove,
	rule,
	ruleCount,
	variations,
}: {
	defaultVariationId: string;
	disabled: boolean;
	ruleIndex: number;
	onChange: (rule: RuleDraft) => void;
	onMove: (offset: -1 | 1) => void;
	onRemove: () => void;
	rule: RuleDraft;
	ruleCount: number;
	variations: VariationDraft[];
}): JSX.Element {
	const groups = groupConditions(rule.conditions);
	const serveItems = variationItems(variations, defaultVariationId);

	function updateCondition(
		conditionIndex: number,
		condition: RuleConditionDraft
	): void {
		onChange({
			...rule,
			conditions: rule.conditions.map((current, index) =>
				index === conditionIndex ? condition : current
			),
		});
	}

	function removeCondition(conditionIndex: number): void {
		if (rule.conditions.length === 1) {
			onChange({ ...rule, conditions: [] });
			return;
		}
		const conditions = rule.conditions.filter(
			(_, index) => index !== conditionIndex
		);
		const [first] = conditions;
		if (first !== undefined) {
			conditions[0] = { ...first, joinOperator: "AND" };
		}
		onChange({ ...rule, conditions });
	}

	function addOrCondition(afterIndex: number): void {
		const conditions = [...rule.conditions];
		conditions.splice(afterIndex + 1, 0, newCondition("OR"));
		onChange({ ...rule, conditions });
	}

	return (
		<section
			aria-labelledby={`flag-rule-${rule.id}`}
			className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base"
		>
			<div className="flex items-center justify-between border-b border-kumo-fill bg-kumo-elevated px-4 py-2.5">
				<p
					className="text-sm font-semibold text-kumo-default"
					id={`flag-rule-${rule.id}`}
				>
					Rule {ruleIndex + 1}
				</p>
				<div className="flex items-center gap-1">
					{ruleCount > 1 ? (
						<>
							<Button
								aria-label={`Move rule ${ruleIndex + 1} up`}
								disabled={disabled || ruleIndex === 0}
								icon={<CaretUpIcon size={14} />}
								onClick={() => onMove(-1)}
								shape="square"
								variant="ghost"
							/>
							<Button
								aria-label={`Move rule ${ruleIndex + 1} down`}
								disabled={disabled || ruleIndex === ruleCount - 1}
								icon={<CaretDownIcon size={14} />}
								onClick={() => onMove(1)}
								shape="square"
								variant="ghost"
							/>
						</>
					) : null}
					<Button
						aria-label={`Delete rule ${ruleIndex + 1}`}
						className="text-kumo-subtle hover:text-kumo-danger"
						disabled={disabled}
						icon={<TrashIcon size={14} />}
						onClick={onRemove}
						shape="square"
						variant="ghost"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-4 px-4 py-4">
				{rule.conditionsEditable ? (
					rule.conditions.length === 0 ? (
						<div className="rounded-lg bg-kumo-elevated px-3 py-2 text-sm text-kumo-subtle">
							Matches every request that reaches this rule.
						</div>
					) : (
						groups.map((group, groupIndex) => (
							<div
								className="flex flex-col gap-2"
								key={group.conditions[0]?.id ?? group.startIndex}
							>
								{groupIndex > 0 ? (
									<div className="flex items-center gap-3 py-1">
										<div className="h-px flex-1 bg-kumo-fill" />
										<span className="text-xs text-kumo-subtle">
											AND any of the following
										</span>
										<div className="h-px flex-1 bg-kumo-fill" />
									</div>
								) : null}
								{group.conditions.map((condition, conditionOffset) => {
									const conditionIndex = group.startIndex + conditionOffset;
									return (
										<ConditionRow
											condition={condition}
											disabled={disabled}
											key={condition.id}
											label={conditionOffset === 0 ? "IF" : "OR"}
											onChange={(next) => updateCondition(conditionIndex, next)}
											onRemove={() => removeCondition(conditionIndex)}
										/>
									);
								})}
								<Button
									className="ml-10 self-start"
									disabled={disabled}
									icon={<PlusIcon size={12} />}
									onClick={() =>
										addOrCondition(
											group.startIndex + group.conditions.length - 1
										)
									}
									size="sm"
									variant="ghost"
								>
									OR condition
								</Button>
							</div>
						))
					)
				) : (
					<Banner
						description="This rule has a nested condition structure that cannot be represented safely here. Its conditions will be preserved unchanged."
						variant="alert"
					/>
				)}
				{rule.conditionsEditable ? (
					<Button
						className="self-center"
						disabled={disabled}
						icon={<PlusIcon size={12} />}
						onClick={() =>
							onChange({
								...rule,
								conditions: [...rule.conditions, newCondition()],
							})
						}
						size="sm"
						variant="ghost"
					>
						{rule.conditions.length === 0 ? "Add condition" : "AND group"}
					</Button>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-3 border-t border-kumo-fill px-4 py-3">
				<span className="text-xs font-semibold text-kumo-subtle">SERVE</span>
				<Select
					aria-label="Serve variant"
					className="min-w-40"
					disabled={disabled}
					items={serveItems}
					onValueChange={(serveVariationId) =>
						onChange({ ...rule, serveVariationId: String(serveVariationId) })
					}
					value={rule.serveVariationId}
				>
					{variations.map((variation) => (
						<Select.Option key={variation.id} value={variation.id}>
							{serveItems[variation.id]}
						</Select.Option>
					))}
				</Select>

				{rule.rollout === null ? (
					<Button
						className="ml-auto"
						disabled={disabled}
						onClick={() =>
							onChange({
								...rule,
								rollout: {
									attribute: "",
									attributeEdited: false,
									percentage: "50",
								},
							})
						}
						size="sm"
						variant="ghost"
					>
						Add percentage rollout
					</Button>
				) : (
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg bg-kumo-elevated p-2">
						<span className="text-xs text-kumo-subtle">to</span>
						<div className="relative w-24">
							<TextInput
								ariaLabel="Rollout percentage"
								className="pr-7 text-right tabular-nums"
								disabled={disabled}
								numeric
								onValueChange={(percentage) =>
									onChange({
										...rule,
										rollout: {
											attribute: rule.rollout?.attribute ?? "",
											attributeEdited: rule.rollout?.attributeEdited ?? false,
											originalAttribute: rule.rollout?.originalAttribute,
											percentage,
										},
									})
								}
								value={rule.rollout.percentage}
							/>
							<PercentIcon
								className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-kumo-subtle"
								size={12}
							/>
						</div>
						<span className="text-xs text-kumo-subtle">of matches by</span>
						<TextInput
							ariaLabel="Rollout attribute"
							className="min-w-36 flex-1"
							disabled={disabled}
							onValueChange={(attribute) =>
								onChange({
									...rule,
									rollout: {
										attribute,
										attributeEdited: true,
										originalAttribute: rule.rollout?.originalAttribute,
										percentage: rule.rollout?.percentage ?? "",
									},
								})
							}
							placeholder="targetingKey"
							value={rule.rollout.attribute}
						/>
						<Button
							aria-label="Remove percentage rollout"
							disabled={disabled}
							icon={<XIcon size={14} />}
							onClick={() => onChange({ ...rule, rollout: null })}
							shape="square"
							variant="ghost"
						/>
					</div>
				)}
			</div>
		</section>
	);
}

const SPLIT_COLOR_INDICES = [0, 3, 5, 7, 9];

function splitColor(index: number): string {
	return ChartPalette.color(
		SPLIT_COLOR_INDICES[index % SPLIT_COLOR_INDICES.length] ?? 0
	);
}

function PercentageBar({
	segments,
}: {
	segments: Array<{ color: string; label: string; percentage: number }>;
}): JSX.Element {
	const total = segments.reduce((sum, segment) => sum + segment.percentage, 0);
	const remaining = Math.max(0, 100 - total);
	return (
		<div className="flex h-5 w-full gap-0.5 overflow-hidden rounded">
			{segments.map((segment) =>
				segment.percentage <= 0 ? null : (
					<div
						className="flex items-center overflow-hidden"
						key={segment.label}
						style={{
							backgroundColor: `color-mix(in srgb, ${segment.color} 18%, transparent)`,
							width: `${(segment.percentage / Math.max(100, total)) * 100}%`,
						}}
					>
						<span
							className="truncate px-1.5 text-xs font-medium"
							style={{ color: segment.color }}
						>
							{segment.label} {Math.round(segment.percentage)}%
						</span>
					</div>
				)
			)}
			{remaining > 0 ? (
				<div className="bg-kumo-fill" style={{ width: `${remaining}%` }} />
			) : null}
		</div>
	);
}

function DefaultServeEditor({
	defaultServe,
	defaultVariationId,
	disabled,
	error,
	onChange,
	variations,
}: {
	defaultServe: DefaultServeDraft;
	defaultVariationId: string;
	disabled: boolean;
	error?: string;
	onChange: (defaultServe: DefaultServeDraft) => void;
	variations: VariationDraft[];
}): JSX.Element {
	const splits = alignSplits(defaultServe.splits, variations);
	const canSplit = variations.length > 1;
	const mode = canSplit ? defaultServe.mode : "variation";
	const nameById = new Map(
		variations.map((variation) => [variation.id, variation.name])
	);
	const defaultName =
		variations.find((variation) => variation.id === defaultVariationId)?.name ??
		"";
	const modeItems: Record<string, string> = {
		percentage: "a percentage split",
		variation:
			defaultName === "" ? "the default variant" : `${defaultName} (default)`,
	};
	const total = splits.reduce(
		(sum, split) => sum + (Number(split.weight) || 0),
		0
	);
	const displayedTotal = Number(total.toFixed(10));

	function changeMode(next: string): void {
		if (next === "percentage" && defaultServe.mode !== "percentage") {
			onChange({
				...defaultServe,
				mode: "percentage",
				splits: evenSplits(variations),
			});
			return;
		}
		onChange({
			...defaultServe,
			mode: next === "percentage" ? next : "variation",
		});
	}

	function changeWeight(variationId: string, weight: string): void {
		onChange({
			...defaultServe,
			splits: splits.map((split) =>
				split.variationId === variationId ? { ...split, weight } : split
			),
		});
	}

	return (
		<div className="flex flex-col gap-4 border-t border-kumo-fill px-4 py-4">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-56 flex-1">
					<Select
						className="w-full"
						disabled={disabled || variations.length === 0}
						items={modeItems}
						label="When no rules match, serve"
						onValueChange={(next) => changeMode(String(next))}
						value={mode}
					>
						<Select.Option value="variation">
							{modeItems.variation}
						</Select.Option>
						<Select.Option disabled={!canSplit} value="percentage">
							{canSplit ? (
								"a percentage split"
							) : (
								<span className="flex flex-col">
									<span>a percentage split</span>
									<span className="text-xs text-kumo-subtle">
										Requires two or more variants.
									</span>
								</span>
							)}
						</Select.Option>
					</Select>
				</div>
				{mode === "percentage" ? (
					<div className="min-w-56 flex-1">
						<Field htmlFor="flag-split-key" label="Targeting key" optional>
							<TextInput
								disabled={disabled}
								id="flag-split-key"
								onValueChange={(targetingKey) =>
									onChange({ ...defaultServe, targetingKey })
								}
								placeholder="targetingKey"
								value={defaultServe.targetingKey}
							/>
						</Field>
					</div>
				) : null}
			</div>

			{mode === "percentage" ? (
				<>
					<PercentageBar
						segments={splits.map((split, index) => ({
							color: splitColor(index),
							label: nameById.get(split.variationId) ?? "",
							percentage: Number(split.weight) || 0,
						}))}
					/>
					<div className="flex flex-col gap-2">
						{splits.map((split, index) => (
							<div className="flex items-center gap-3" key={split.variationId}>
								<div className="relative w-24">
									<TextInput
										ariaLabel={`Percentage for ${nameById.get(split.variationId) ?? "variant"}`}
										className="pr-7 text-right tabular-nums"
										disabled={disabled}
										numeric
										onValueChange={(weight) =>
											changeWeight(split.variationId, weight)
										}
										value={split.weight}
									/>
									<PercentIcon
										className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-kumo-subtle"
										size={12}
									/>
								</div>
								<span
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: splitColor(index) }}
								/>
								<span className="truncate font-mono text-sm text-kumo-default">
									{nameById.get(split.variationId)}
								</span>
							</div>
						))}
						<div className="flex items-center gap-3">
							<span className="w-24 text-right text-sm text-kumo-default tabular-nums">
								{displayedTotal}%
							</span>
							<span className="text-sm text-kumo-subtle">Total</span>
							{Math.abs(total - 100) < 1e-9 ? null : (
								<span className="text-sm text-kumo-danger">Should be 100%</span>
							)}
						</div>
					</div>
				</>
			) : null}

			{error === undefined ? null : (
				<p className="text-xs text-kumo-danger" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

export function RuleEditor({
	defaultServe,
	defaultVariationId,
	disabled,
	error,
	onChange,
	onDefaultServeChange,
	rules,
	splitError,
	variations,
}: RuleEditorProps): JSX.Element {
	const availableVariations = variations.filter((variation) =>
		Boolean(variation.name.trim())
	);

	function addRule(): void {
		onChange([
			...rules,
			{
				conditions: [newCondition()],
				conditionsEditable: true,
				id: crypto.randomUUID(),
				priority: Math.max(0, ...rules.map((rule) => rule.priority)) + 1,
				rollout: null,
				serveVariationId: availableVariations[0]?.id ?? "",
			},
		]);
	}

	function moveRule(index: number, offset: -1 | 1): void {
		const target = index + offset;
		if (target < 0 || target >= rules.length) {
			return;
		}
		const next = [...rules];
		onChange(
			next.map((rule, currentIndex) => {
				let moved = rule;
				if (currentIndex === index) {
					moved = next[target] ?? rule;
				}
				if (currentIndex === target) {
					moved = next[index] ?? rule;
				}
				return { ...moved, priority: currentIndex + 1 };
			})
		);
	}

	return (
		<div
			aria-describedby={error === undefined ? undefined : "flag-rules-error"}
			aria-label="Targeting rules"
			className="flex flex-col gap-3"
			role="group"
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<Label>Targeting rules</Label>
					<p className="mt-1 text-xs text-kumo-subtle">
						Checked from top to bottom. The first matching rule wins; unmatched
						requests receive the default variant.
					</p>
				</div>
				<Button
					disabled={disabled || availableVariations.length === 0}
					icon={<PlusIcon size={14} />}
					onClick={addRule}
					size="sm"
					variant="ghost"
				>
					Add rule
				</Button>
			</div>

			<div className="overflow-hidden rounded-lg border border-kumo-fill">
				{rules.length === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-kumo-subtle">
						No targeting rules yet.
					</p>
				) : (
					<div className="flex flex-col gap-3 p-3">
						{rules.map((rule, index) => (
							<RuleCard
								defaultVariationId={defaultVariationId}
								disabled={disabled}
								ruleIndex={index}
								key={rule.id}
								onChange={(next) =>
									onChange(
										rules.map((current) =>
											current.id === rule.id ? next : current
										)
									)
								}
								onMove={(offset) => moveRule(index, offset)}
								onRemove={() =>
									onChange(rules.filter((current) => current.id !== rule.id))
								}
								rule={rule}
								ruleCount={rules.length}
								variations={availableVariations}
							/>
						))}
					</div>
				)}

				<DefaultServeEditor
					defaultServe={defaultServe}
					defaultVariationId={defaultVariationId}
					disabled={disabled}
					error={splitError}
					onChange={onDefaultServeChange}
					variations={availableVariations}
				/>
			</div>

			{error === undefined ? null : (
				<p
					className="text-xs text-kumo-danger"
					id="flag-rules-error"
					role="alert"
				>
					{error}
				</p>
			)}
		</div>
	);
}
