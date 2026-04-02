import { cn } from "@cloudflare/kumo";
import { forwardRef, useMemo } from "react";
import { createStudioEditableCell } from "./EditableCell";
import type { StudioTableHeaderProps } from "../BaseTable";
import type { StudioResultHeaderMetadata } from "../State/Helpers";

interface TableCellProps<T = unknown> {
	align?: "left" | "right";
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
	onDoubleClick?: () => void;
	value: T;
}

/**
 * Converts a byte array into a human-readable string representation.
 *
 * This function transforms binary data for display purposes by:
 * - Escaping backslash characters as `\\` to prevent ambiguity
 * - Rendering printable ASCII characters (0x20-0x7E, excluding DEL) as-is
 * - Representing non-printable bytes as hex escape sequences (e.g., `\x00`, `\x1F`)
 *
 * Used by `BlobCellValue` to display binary BLOB data in the result table.
 *
 * @param bytes - The byte array to convert
 * @returns A string representation of the bytes, suitable for display in UI
 *
 * @example
 * ```ts
 * prettifyBytes(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
 * prettifyBytes(new Uint8Array([0x00, 0x1F, 0x7F])); // "\\x00\\x1F\\x7F"
 * prettifyBytes(new Uint8Array([0x5C])); // "\\\\"
 * ```
 */
export function prettifyBytes(bytes: Uint8Array): string {
	return [...bytes]
		.map((b) =>
			b === 0x5c
				? "\\\\"
				: b >= 0x20 && b !== 0x7f
					? String.fromCharCode(b)
					: "\\x" + b.toString(16).toUpperCase().padStart(2, "0")
		)
		.join("");
}

interface BlobCellValueProps {
	value: Uint8Array | ArrayBuffer | number[];
	vector?: boolean;
}

function BlobCellValue({ value, vector }: BlobCellValueProps): JSX.Element {
	if (vector) {
		const floatArray = new Float32Array(new Uint8Array(value).buffer);
		const floatArrayText = floatArray.join(", ");

		return (
			<div className="flex">
				<div className="mr-2 flex-col items-center justify-center">
					<span className="inline rounded bg-blue-500 p-1 pr-2 pl-2 text-white">
						vec({floatArray.length})
					</span>
				</div>
				<div className="text-orange-600">[{floatArrayText}]</div>
			</div>
		);
	}

	const bytes = new Uint8Array(value);

	return (
		<div className="flex w-full">
			<span className="flex-1 truncate text-kumo-warning">
				{prettifyBytes(bytes.subarray(0, 64))}
			</span>
			<div className="ml-2 flex-col items-center justify-center">
				<span className="inline rounded bg-blue-500 p-1 pr-2 pl-2 text-white">
					{bytes.length.toLocaleString(undefined, {
						maximumFractionDigits: 0,
					})}
					{" bytes"}
				</span>
			</div>
		</div>
	);
}

export const StudioTableDisplayCell = forwardRef<
	HTMLDivElement,
	TableCellProps
>(({ align, header, onDoubleClick, value }, ref) => {
	const isAlignRight = align === "right";

	const textBaseStyle = cn(
		"flex grow text-kumo-subtle",
		isAlignRight ? "justify-end" : ""
	);

	const content = useMemo(() => {
		if (value === null) {
			return <span className={textBaseStyle}>NULL</span>;
		}

		if (value === undefined) {
			return (
				<span className={textBaseStyle}>
					{header.metadata.columnSchema?.constraint?.generatedExpression ??
						"DEFAULT"}
				</span>
			);
		}

		if (typeof value === "string") {
			const newlineIndex = value.indexOf("\n");
			const hasLineBreak = newlineIndex !== -1;
			const firstLine = hasLineBreak ? value.slice(0, newlineIndex) : value;

			return (
				<span className={cn("flex-1 truncate", "text-kumo-default")}>
					{firstLine}
					{hasLineBreak && (
						<span className="ml-1 font-sans text-kumo-subtle">⏎</span>
					)}
				</span>
			);
		}

		if (typeof value === "number" || typeof value === "bigint") {
			return (
				<span
					className={cn(
						"flex-1 truncate",
						"block grow text-right text-kumo-link"
					)}
				>
					{value}
				</span>
			);
		}

		if (
			value instanceof ArrayBuffer ||
			value instanceof Uint8Array ||
			Array.isArray(value)
		) {
			return (
				<BlobCellValue
					value={value}
					vector={
						header.metadata.originalType?.includes("F32_BLOB") ||
						header.metadata.originalType?.includes("FLOAT32 ")
					}
				/>
			);
		}

		return <span>{value.toString()}</span>;
	}, [value, textBaseStyle, header]);

	return (
		<div
			ref={ref}
			className={cn("flex h-8.75 font-mono leading-8.75", "pr-2 pl-2")}
			onDoubleClick={onDoubleClick}
		>
			<div className="flex grow overflow-hidden">{content}</div>
		</div>
	);
});

StudioTableDisplayCell.displayName = "StudioTableDisplayCell";

export const StudioEditableNumberCell = createStudioEditableCell<number>({
	align: "right",
	toString: (v) => {
		if (v === null) {
			return null;
		}

		if (v === undefined) {
			return undefined;
		}

		return v.toString();
	},
	toValue: (v) => {
		if (v === null) {
			return null;
		}

		if (v === undefined) {
			return undefined;
		}

		if (v === "") {
			return null;
		}

		const parsedNumber = Number(v);
		if (Number.isFinite(parsedNumber)) {
			return parsedNumber;
		}
		return null;
	},
});

export const StudioEditableTextCell = createStudioEditableCell<string>({
	toString: (v) => {
		if (v === null) {
			return null;
		}

		if (v === undefined) {
			return undefined;
		}

		return v.toString();
	},
	toValue: (v) => v,
});
