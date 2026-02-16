import { isDarkMode } from "@cloudflare/style-const";
import { useState } from "react";

/** Type guard for non-null objects (including arrays). */
function isObject(value: unknown): value is object {
	return value !== null && typeof value === "object";
}

/**
 * Color values for different value types, adapting to dark/light mode.
 */
function typeColors() {
	const dark = isDarkMode();
	return {
		string: dark ? "#c4b5fd" : "#7c3aed",
		number: dark ? "#fbbf24" : "#ea580c",
		boolean: dark ? "#f472b6" : "#db2777",
		null: dark ? "#9ca3af" : "#6b7280",
		key: dark ? "#e5e7eb" : "#1f2937",
		bracket: dark ? "#9ca3af" : "#6b7280",
		preview: dark ? "#9ca3af" : "#6b7280",
	};
}

const monoStyle: React.CSSProperties = {
	fontFamily: "monospace",
};

/**
 * Renders a single primitive value with type-appropriate coloring.
 */
function PrimitiveValue({ value }: { value: unknown }) {
	const colors = typeColors();

	if (value === null || value === undefined) {
		return (
			<span style={{ ...monoStyle, color: colors.null }}>
				<em>{String(value)}</em>
			</span>
		);
	}

	switch (typeof value) {
		case "string":
			return (
				<span style={{ ...monoStyle, color: colors.string }}>
					&quot;{value}&quot;
				</span>
			);
		case "number":
		case "bigint":
			return (
				<span style={{ ...monoStyle, color: colors.number }}>
					{String(value)}
				</span>
			);
		case "boolean":
			return (
				<span style={{ ...monoStyle, color: colors.boolean }}>
					{String(value)}
				</span>
			);
		default:
			return (
				<span style={{ ...monoStyle, color: colors.null }}>
					{String(value)}
				</span>
			);
	}
}

/**
 * Returns a collapsed preview string for an object or array.
 * e.g. `{name: "foo", count: 3}` or `[1, 2, 3]`
 */
function collapsedPreview(value: object): string {
	if (Array.isArray(value)) {
		if (value.length <= 5) {
			const items = value.map((v) => primitivePreview(v));
			const preview = `[${items.join(", ")}]`;
			if (preview.length <= 80) {
				return preview;
			}
		}
		return value.length === 0 ? "[]" : `Array(${value.length})`;
	}

	const entries = Object.entries(value);
	if (entries.length <= 3) {
		const items = entries.map(([k, v]) => `${k}: ${primitivePreview(v)}`);
		const preview = `{${items.join(", ")}}`;
		if (preview.length <= 80) {
			return preview;
		}
	}
	return entries.length === 0 ? "{}" : `{…}`;
}

function primitivePreview(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		if (value.length > 30) {
			return `"${value.slice(0, 30)}…"`;
		}
		return `"${value}"`;
	}
	if (isObject(value)) {
		if (Array.isArray(value)) {
			return `Array(${value.length})`;
		}
		return "{…}";
	}
	return String(value);
}

/**
 * Renders an expandable tree node for an object or array value.
 * Each nesting level is independently expandable/collapsible.
 */
function ObjectTree({ value, label }: { value: object; label?: string }) {
	const [expanded, setExpanded] = useState(false);
	const colors = typeColors();
	const isArray = Array.isArray(value);
	const entries = isArray
		? value.map((v, i) => [String(i), v] as const)
		: Object.entries(value);

	if (entries.length === 0) {
		return (
			<span style={{ display: "inline", ...monoStyle }}>
				{label !== undefined && (
					<>
						<span style={{ display: "inline-block", width: 12 }} />
						<span style={{ ...monoStyle, color: colors.key }}>{label}</span>
						<span style={{ color: colors.bracket }}>{": "}</span>
					</>
				)}
				<span style={{ ...monoStyle, color: colors.bracket }}>
					{isArray ? "[]" : "{}"}
				</span>
			</span>
		);
	}

	return (
		<span style={{ display: "inline", ...monoStyle }}>
			<span
				style={{ display: "inline", cursor: "pointer", userSelect: "none" }}
				onClick={(e) => {
					e.stopPropagation();
					setExpanded(!expanded);
				}}
			>
				<span
					style={{
						display: "inline-block",
						width: 12,
						textAlign: "center",
						fontSize: 10,
						...monoStyle,
					}}
				>
					{expanded ? "▼" : "▶"}
				</span>
				{label !== undefined && (
					<>
						<span style={{ ...monoStyle, color: colors.key }}>{label}</span>
						<span style={{ color: colors.bracket }}>{": "}</span>
					</>
				)}
				{!expanded && (
					<span style={{ ...monoStyle, color: colors.preview }}>
						{collapsedPreview(value)}
					</span>
				)}
			</span>
			{expanded && (
				<>
					<span style={{ ...monoStyle, color: colors.bracket }}>
						{isArray ? "[" : "{"}
					</span>
					<span style={{ display: "block", paddingLeft: 16 }}>
						{entries.map(([key, val], idx) => (
							<span
								style={{ display: "block" }}
								key={isArray ? `arr-${idx}` : `obj-${key}-${idx}`}
							>
								<ValueNode label={key} value={val} />
							</span>
						))}
					</span>
					<span style={{ ...monoStyle, color: colors.bracket }}>
						{isArray ? "]" : "}"}
					</span>
				</>
			)}
		</span>
	);
}

/**
 * Renders a single key-value entry. If the value is an object/array, it becomes
 * an expandable ObjectTree. Otherwise it renders as a labeled primitive.
 */
function ValueNode({ label, value }: { label: string; value: unknown }) {
	const colors = typeColors();

	if (isObject(value)) {
		return <ObjectTree value={value} label={label} />;
	}

	return (
		<span style={monoStyle}>
			<span style={{ display: "inline-block", width: 12 }} />
			<span style={{ ...monoStyle, color: colors.key }}>{label}</span>
			<span style={{ color: colors.bracket }}>{": "}</span>
			<PrimitiveValue value={value} />
		</span>
	);
}

/**
 * Renders a single message part from console.log output.
 * Strings render inline; objects/arrays render as expandable trees.
 */
function MessagePart({ value }: { value: unknown }) {
	if (isObject(value)) {
		return <ObjectTree value={value} />;
	}

	// Strings render without quotes at the top level (matching console.log behavior)
	if (typeof value === "string") {
		return <span style={monoStyle}>{value}</span>;
	}

	return <PrimitiveValue value={value} />;
}

/**
 * Top-level component that renders an array of console.log arguments.
 * Each argument is rendered as a MessagePart, separated by spaces.
 */
export function ExpandableLogMessage({ messages }: { messages: unknown[] }) {
	return (
		<span style={{ ...monoStyle, fontSize: 12, lineHeight: "18px" }}>
			{messages.map((msg, i) => (
				<span key={i}>
					{i > 0 && " "}
					<MessagePart value={msg} />
				</span>
			))}
		</span>
	);
}

/**
 * Returns a plain-text summary of the messages for use in title/tooltip attributes.
 */
export function messageSummary(messages: unknown[]): string {
	return messages
		.map((msg) => {
			if (msg === null) {
				return "null";
			}
			if (msg === undefined) {
				return "undefined";
			}
			if (isObject(msg)) {
				try {
					const json = JSON.stringify(msg);
					return json.length > 500 ? json.slice(0, 500) + "…" : json;
				} catch {
					return String(msg);
				}
			}
			return String(msg);
		})
		.join(" ");
}
