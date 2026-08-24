import {
	Badge,
	Button,
	cn,
	inputVariants,
	Select,
	Tooltip,
} from "@cloudflare/kumo";
import {
	CaretDownIcon,
	CaretUpIcon,
	PlusIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { TextInput } from "./FormFields";
import {
	emptyCondition,
	emptyRule,
	groupRows,
	isOperator,
	LIST_OPERATORS,
	NUMERIC_OPERATORS,
	OPERATOR_LABELS,
	type RuleError,
	type UICondition,
	type UIRule,
} from "./rule-helpers";
import type { JSX, KeyboardEvent } from "react";

const ROW_GRID =
	"grid grid-cols-[2.75rem_minmax(0,1fr)_11rem_minmax(0,1fr)_2.25rem] items-center gap-2";

const KEYWORD = "text-xs font-medium tracking-wide text-kumo-subtle uppercase";

interface TagInputProps {
	ariaLabel: string;
	disabled?: boolean;
	onChange: (value: string) => void;
	/** Newline separated list of entries. */
	value: string;
}

/**
 * Renders a list value as removable chips.
 *
 * The `in` and `not_in` operators compare against a list, so entries are added
 * with Enter or a comma and removed with Backspace or the chip's close button.
 */
function TagInput({
	ariaLabel,
	disabled,
	onChange,
	value,
}: TagInputProps): JSX.Element {
	const entries = value.split("\n").filter((entry) => entry !== "");

	/**
	 * Adds or removes entries in response to Enter, comma, and Backspace.
	 */
	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		const input = event.currentTarget;
		const typed = input.value.trim();

		if ((event.key === "Enter" || event.key === ",") && typed !== "") {
			event.preventDefault();
			event.stopPropagation();
			if (!entries.includes(typed)) {
				onChange([...entries, typed].join("\n"));
			}
			input.value = "";
			return;
		}
		if (event.key === "Backspace" && input.value === "" && entries.length > 0) {
			event.preventDefault();
			onChange(entries.slice(0, -1).join("\n"));
		}
	}

	return (
		<div
			className={cn(
				inputVariants({ focusIndicator: true, size: "base" }),
				"flex h-auto min-h-9 flex-wrap items-center gap-1 px-2 py-1",
				"focus-within:ring-2 focus-within:ring-kumo-brand",
				disabled === true && "cursor-not-allowed opacity-60"
			)}
		>
			{entries.map((entry) => (
				<span
					className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-kumo-elevated pr-1 pl-2 font-mono text-xs ring-1 ring-kumo-fill"
					key={entry}
				>
					{entry}
					<button
						aria-label={`Remove ${entry}`}
						className="flex size-4 items-center justify-center rounded-sm bg-transparent text-kumo-subtle hover:text-kumo-default"
						disabled={disabled}
						onClick={() =>
							onChange(entries.filter((item) => item !== entry).join("\n"))
						}
						type="button"
					>
						<XIcon size={10} weight="bold" />
					</button>
				</span>
			))}
			<input
				aria-label={ariaLabel}
				autoComplete="off"
				className="h-6 min-w-16 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-kumo-placeholder"
				disabled={disabled}
				onBlur={(event) => {
					const typed = event.currentTarget.value.trim();
					if (typed !== "" && !entries.includes(typed)) {
						onChange([...entries, typed].join("\n"));
					}
					event.currentTarget.value = "";
				}}
				onKeyDown={handleKeyDown}
				placeholder={entries.length === 0 ? "Value, then Enter" : ""}
				spellCheck={false}
				type="text"
			/>
		</div>
	);
}

interface ConditionRowProps {
	condition: UICondition;
	disabled: boolean;
	label: string;
	onChange: (patch: Partial<UICondition>) => void;
	onRemove: () => void;
}

/**
 * Renders one condition of a targeting rule.
 */
function ConditionRow({
	condition,
	disabled,
	label,
	onChange,
	onRemove,
}: ConditionRowProps): JSX.Element {
	const isList = LIST_OPERATORS.has(condition.operator);

	return (
		<div className={ROW_GRID}>
			<span className={KEYWORD}>{label}</span>
			<TextInput
				ariaLabel="Attribute"
				disabled={disabled}
				mono
				onValueChange={(attribute) => onChange({ attribute })}
				placeholder="attribute"
				value={condition.attribute}
			/>
			<Select
				aria-label="Operator"
				className="w-full"
				disabled={disabled}
				items={OPERATOR_LABELS}
				onValueChange={(next) => {
					if (next === null || !isOperator(next)) {
						return;
					}
					const wasList = LIST_OPERATORS.has(condition.operator);
					onChange({
						operator: next,
						...(wasList === LIST_OPERATORS.has(next) ? {} : { value: "" }),
					});
				}}
				value={condition.operator}
			/>
			{isList ? (
				<TagInput
					ariaLabel={`Values for ${condition.attribute || "condition"}`}
					disabled={disabled}
					onChange={(value) => onChange({ value })}
					value={condition.value}
				/>
			) : (
				<TextInput
					ariaLabel={`Value for ${condition.attribute || "condition"}`}
					disabled={disabled}
					mono
					numeric={NUMERIC_OPERATORS.has(condition.operator)}
					onValueChange={(value) => onChange({ value })}
					placeholder={
						NUMERIC_OPERATORS.has(condition.operator) ? "number" : "value"
					}
					value={condition.value}
				/>
			)}
			<Button
				aria-label="Remove condition"
				className="justify-self-center text-kumo-subtle hover:text-kumo-danger"
				disabled={disabled}
				icon={<TrashIcon size={14} />}
				onClick={onRemove}
				shape="square"
				variant="ghost"
			/>
		</div>
	);
}

interface RuleCardProps {
	disabled: boolean;
	error: string | undefined;
	index: number;
	onChange: (rule: UIRule) => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	rule: UIRule;
	ruleCount: number;
	variationNames: string[];
}

/**
 * Renders a single targeting rule.
 */
function RuleCard({
	disabled,
	error,
	index,
	onChange,
	onMove,
	onRemove,
	rule,
	ruleCount,
	variationNames,
}: RuleCardProps): JSX.Element {
	const groups = groupRows(rule.conditions);
	const isCatchAll =
		rule.conditions.length === 0 &&
		(rule.rollout === null || rule.rollout.percentage === 100);

	/**
	 * Replaces one condition, keyed by its position in the flat list.
	 */
	function updateCondition(
		position: number,
		patch: Partial<UICondition>
	): void {
		onChange({
			...rule,
			conditions: rule.conditions.map((condition, current) =>
				current === position ? { ...condition, ...patch } : condition
			),
		});
	}

	/**
	 * Removes a condition, resetting the join on whichever row is now first.
	 */
	function removeCondition(position: number): void {
		const conditions = rule.conditions.filter(
			(_, current) => current !== position
		);
		const [first] = conditions;
		if (first !== undefined) {
			conditions[0] = { ...first, join: "AND" };
		}
		onChange({ ...rule, conditions });
	}

	/**
	 * Inserts a condition after the given position.
	 */
	function insertCondition(position: number, join: "AND" | "OR"): void {
		const conditions = [...rule.conditions];
		conditions.splice(position + 1, 0, emptyCondition(join));
		onChange({ ...rule, conditions });
	}

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border bg-kumo-base",
				error === undefined ? "border-kumo-fill" : "border-kumo-danger"
			)}
		>
			<div className="flex items-center gap-2 bg-kumo-elevated px-4 py-2">
				<span className="text-sm font-medium text-kumo-default">
					Rule {index + 1}
				</span>
				{isCatchAll ? (
					<Tooltip
						content="With no conditions this rule matches every request, so it must be the last rule."
						delay={400}
					>
						<Badge variant="secondary">Applies to everyone</Badge>
					</Tooltip>
				) : null}
				<div className="ml-auto flex items-center gap-1">
					{ruleCount > 1 ? (
						<>
							<Button
								aria-label={`Move rule ${index + 1} up`}
								className="text-kumo-subtle hover:text-kumo-default"
								disabled={disabled || index === 0}
								icon={<CaretUpIcon size={14} weight="bold" />}
								onClick={() => onMove(-1)}
								shape="square"
								size="sm"
								variant="ghost"
							/>
							<Button
								aria-label={`Move rule ${index + 1} down`}
								className="text-kumo-subtle hover:text-kumo-default"
								disabled={disabled || index === ruleCount - 1}
								icon={<CaretDownIcon size={14} weight="bold" />}
								onClick={() => onMove(1)}
								shape="square"
								size="sm"
								variant="ghost"
							/>
						</>
					) : null}
					<Button
						aria-label={`Remove rule ${index + 1}`}
						className="text-kumo-subtle hover:text-kumo-danger"
						disabled={disabled}
						icon={<TrashIcon size={14} />}
						onClick={onRemove}
						shape="square"
						size="sm"
						variant="ghost"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2 border-t border-kumo-fill px-4 py-3">
				{isCatchAll ? (
					<p className="text-sm text-kumo-subtle">
						No conditions, so this rule matches every request.
					</p>
				) : (
					groups.map((group, groupIndex) => (
						<div className="flex flex-col gap-2" key={group.startIndex}>
							{groupIndex > 0 ? (
								<div className="flex items-center gap-3 py-1">
									<span className="h-px flex-1 bg-kumo-fill" />
									<span className={KEYWORD}>And any of</span>
									<span className="h-px flex-1 bg-kumo-fill" />
								</div>
							) : null}
							{group.rows.map((condition, rowIndex) => {
								const position = group.startIndex + rowIndex;
								return (
									<ConditionRow
										condition={condition}
										disabled={disabled}
										key={position}
										label={rowIndex === 0 ? "If" : "Or"}
										onChange={(patch) => updateCondition(position, patch)}
										onRemove={() => removeCondition(position)}
									/>
								);
							})}
							<div className="pl-[calc(2.75rem+0.5rem)]">
								<Button
									disabled={disabled}
									icon={<PlusIcon size={12} weight="bold" />}
									onClick={() =>
										insertCondition(
											group.startIndex + group.rows.length - 1,
											"OR"
										)
									}
									size="sm"
									variant="ghost"
								>
									Or
								</Button>
							</div>
						</div>
					))
				)}

				<div className="flex justify-center border-t border-kumo-fill pt-2">
					<Button
						disabled={disabled}
						icon={<PlusIcon size={12} weight="bold" />}
						onClick={() => insertCondition(rule.conditions.length - 1, "AND")}
						size="sm"
						variant="ghost"
					>
						{isCatchAll ? "Add condition" : "And"}
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-2 border-t border-kumo-fill px-4 py-3">
				<div className={ROW_GRID}>
					<span className={KEYWORD}>Serve</span>
					<Select
						aria-label={`Variant served by rule ${index + 1}`}
						className="w-full"
						disabled={disabled}
						items={Object.fromEntries(
							variationNames.map((name) => [name, name])
						)}
						onValueChange={(next) => {
							if (next !== null) {
								onChange({ ...rule, serveVariation: next });
							}
						}}
						value={rule.serveVariation}
					/>
					{rule.rollout === null ? (
						<div className="col-span-3">
							<Button
								disabled={disabled}
								icon={<PlusIcon size={12} weight="bold" />}
								onClick={() =>
									onChange({
										...rule,
										rollout: { attribute: "", percentage: 50 },
									})
								}
								size="sm"
								variant="ghost"
							>
								Add percentage rollout
							</Button>
						</div>
					) : null}
				</div>

				{rule.rollout === null ? null : (
					<div className={ROW_GRID}>
						<span className={KEYWORD}>To</span>
						<div className="col-span-3 flex items-center gap-2">
							<div className="w-20">
								<TextInput
									ariaLabel={`Rollout percentage for rule ${index + 1}`}
									disabled={disabled}
									numeric
									onValueChange={(next) => {
										const parsed = Number(next);
										onChange({
											...rule,
											rollout: {
												attribute: rule.rollout?.attribute ?? "",
												percentage: Number.isNaN(parsed) ? 0 : parsed,
											},
										});
									}}
									value={String(rule.rollout.percentage)}
								/>
							</div>
							<span className="text-sm whitespace-nowrap text-kumo-subtle">
								% of matches, bucketed by
							</span>
							<div className="min-w-32 flex-1">
								<TextInput
									ariaLabel={`Rollout attribute for rule ${index + 1}`}
									disabled={disabled}
									mono
									onValueChange={(attribute) =>
										onChange({
											...rule,
											rollout: {
												attribute,
												percentage: rule.rollout?.percentage ?? 0,
											},
										})
									}
									placeholder="targetingKey"
									value={rule.rollout.attribute}
								/>
							</div>
						</div>
						<Button
							aria-label={`Remove percentage rollout from rule ${index + 1}`}
							className="justify-self-center text-kumo-subtle hover:text-kumo-danger"
							disabled={disabled}
							icon={<XIcon size={14} weight="bold" />}
							onClick={() => onChange({ ...rule, rollout: null })}
							shape="square"
							variant="ghost"
						/>
					</div>
				)}
			</div>

			{error === undefined ? null : (
				<p
					className="border-t border-kumo-fill bg-kumo-danger/5 px-4 py-2 text-xs text-kumo-danger"
					role="alert"
				>
					{error}
				</p>
			)}
		</div>
	);
}

interface RuleEditorProps {
	disabled: boolean;
	errors: RuleError[];
	onChange: (rules: UIRule[]) => void;
	rules: UIRule[];
	variationNames: string[];
}

/**
 * Renders the targeting rules for a flag.
 *
 * Rules are evaluated top to bottom and the first match wins, so their order is
 * the order shown here.
 */
export function RuleEditor({
	disabled,
	errors,
	onChange,
	rules,
	variationNames,
}: RuleEditorProps): JSX.Element {
	const [firstVariation] = variationNames;

	/**
	 * Moves a rule up or down, changing the order it is evaluated in.
	 */
	function moveRule(index: number, direction: -1 | 1): void {
		const target = index + direction;
		const moved = rules[index];
		const displaced = rules[target];
		if (moved === undefined || displaced === undefined) {
			return;
		}
		const next = [...rules];
		next[index] = displaced;
		next[target] = moved;
		onChange(next);
	}

	return (
		<div className="flex flex-col gap-3">
			{rules.length === 0 ? (
				<p className="rounded-lg border border-dashed border-kumo-fill px-3 py-6 text-center text-sm text-kumo-subtle">
					No targeting rules. Every request receives the default variant.
				</p>
			) : (
				<div className="flex flex-col gap-3">
					{rules.map((rule, index) => (
						<RuleCard
							disabled={disabled}
							error={errors.find((entry) => entry.index === index)?.message}
							index={index}
							key={rule.id}
							onChange={(next) =>
								onChange(
									rules.map((current, position) =>
										position === index ? next : current
									)
								)
							}
							onMove={(direction) => moveRule(index, direction)}
							onRemove={() =>
								onChange(rules.filter((_, position) => position !== index))
							}
							rule={rule}
							ruleCount={rules.length}
							variationNames={variationNames}
						/>
					))}
				</div>
			)}

			<Button
				className="self-start"
				disabled={disabled || firstVariation === undefined}
				icon={<PlusIcon size={14} />}
				onClick={() => onChange([...rules, emptyRule(firstVariation ?? "")])}
				size="sm"
				variant="secondary"
			>
				Add rule
			</Button>
		</div>
	);
}
