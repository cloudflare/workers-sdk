import { cn, inputVariants, Label } from "@cloudflare/kumo";
import type { JSX, KeyboardEvent, ReactNode } from "react";

type InputSize = "xs" | "sm" | "base" | "lg";

interface TextInputProps {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	invalid?: boolean;
	maxLength?: number;
	mono?: boolean;
	numeric?: boolean;
	onEnter?: () => void;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: InputSize;
	value: string;
}

/**
 * Renders a single-line text input using Kumo's own input styling.
 *
 * Kumo's `Input` component cannot be typed reliably in this workspace because of
 * the duplicated `@types/react` versions, so the flagship forms render a plain
 * element styled with the exported `inputVariants` recipe. Styling therefore
 * stays in step with the design system instead of drifting from it.
 */
export function TextInput({
	ariaLabel,
	className,
	disabled,
	id,
	invalid,
	maxLength,
	mono,
	numeric,
	onEnter,
	onValueChange,
	placeholder,
	size = "base",
	value,
}: TextInputProps): JSX.Element {
	/**
	 * Forwards Enter presses so dialogs can submit from any field.
	 */
	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Enter" && onEnter !== undefined) {
			event.preventDefault();
			onEnter();
		}
	}

	return (
		<input
			aria-invalid={invalid === true ? true : undefined}
			aria-label={ariaLabel}
			autoComplete="off"
			className={cn(
				inputVariants({
					focusIndicator: true,
					size,
					variant: invalid === true ? "error" : "default",
				}),
				"w-full min-w-0 outline-none disabled:cursor-not-allowed",
				mono === true && "font-mono",
				className
			)}
			disabled={disabled}
			id={id}
			inputMode={numeric === true ? "decimal" : undefined}
			maxLength={maxLength}
			onChange={(event) => onValueChange(event.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			spellCheck={false}
			type="text"
			value={value}
		/>
	);
}

interface FieldProps {
	children: ReactNode;
	description?: string;
	error?: string;
	htmlFor?: string;
	label: string;
	optional?: boolean;
}

/**
 * Renders a labelled form field with helper text or a validation message.
 */
export function Field({
	children,
	description,
	error,
	htmlFor,
	label,
	optional,
}: FieldProps): JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={htmlFor} showOptional={optional}>
				{label}
			</Label>
			{children}
			{error === undefined ? (
				description === undefined ? null : (
					<p className="text-xs text-kumo-subtle">{description}</p>
				)
			) : (
				<p className="text-xs text-kumo-danger" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
