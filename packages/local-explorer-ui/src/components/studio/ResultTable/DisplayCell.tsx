import { cn } from "@cloudflare/kumo";
import { forwardRef, useMemo } from "react";
import { createStudioEditableCell } from "./EditableCell";
import type { StudioTableHeaderProps } from "../Table/BaseTable";
import type { StudioResultHeaderMetadata } from "../Table/StateHelpers";

interface TableCellProps<T = unknown> {
	align?: "left" | "right";
	value: T;
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
	onDoubleClick?: () => void;
}

export function prettifyBytes(bytes: Uint8Array) {
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

function BlobCellValue({
	value,
	vector,
}: {
	value: Uint8Array | ArrayBuffer | number[];
	vector?: boolean;
}) {
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
	} else {
		const bytes = new Uint8Array(value);

		return (
			<div className="flex w-full">
				<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-orange-600 dark:text-orange-400">
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
}

export const StudioTableDisplayCell = forwardRef(
	(
		{ value, align, header, onDoubleClick }: TableCellProps,
		ref: React.ForwardedRef<HTMLDivElement>
	) => {
		const className = cn("h-[35px] leading-[35px] font-mono flex", "pl-2 pr-2");
		const isAlignRight = align === "right";

		const textBaseStyle = cn(
			"flex grow text-neutral-500",
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
					<span
						className={cn(
							"flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
							"text-neutral-950 dark:text-neutral-50"
						)}
					>
						{firstLine}
						{hasLineBreak && (
							<span className="ml-1 text-muted font-sans">⏎</span>
						)}
					</span>
				);
			}

			if (typeof value === "number" || typeof value === "bigint") {
				return (
					<span
						className={cn(
							"flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
							"block grow text-right text-blue-700 dark:text-blue-300"
						)}
					>
						{value.toString()}
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
			<div ref={ref} className={className} onDoubleClick={onDoubleClick}>
				<div className="flex grow overflow-hidden">{content}</div>
			</div>
		);
	}
);

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
