import { cn, Tooltip } from "@cloudflare/kumo";
import { TableIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import type { StudioResultSet } from "../../../types/studio";
import type { ReactNode } from "react";

interface StudioSQLiteExplainProps {
	data: StudioResultSet;
}

interface StudioSQLiteExplainRow {
	id: number;
	parent: number;
	detail: string;
}

interface StudioSQLiteExplainTree extends StudioSQLiteExplainRow {
	children: StudioSQLiteExplainTree[];
}

export function StudioSQLiteExplainTab({
	data,
}: StudioSQLiteExplainProps): JSX.Element {
	const rows = data.rows as unknown as StudioSQLiteExplainRow[];

	let tree = rows.map(
		(r) =>
			({
				...r,
				children: [],
			}) satisfies StudioSQLiteExplainTree
	);

	const nodeTable = tree.reduce(
		(a, b) => ({
			...a,
			[b.id]: b,
		}),
		{} as Record<string, StudioSQLiteExplainTree>
	);

	for (const node of tree) {
		if (node.parent) {
			nodeTable[node.parent]?.children.push(node);
		}
	}

	tree = tree.filter((node) => node.parent === 0);

	return (
		<div className="w-full h-full grow p-8 overflow-auto">
			<div className="font-mono text-sm">
				<ExplainNodes data={tree} />
			</div>
		</div>
	);
}

interface ExplainNodesProps {
	data: StudioSQLiteExplainTree[];
}

function ExplainNodes({ data }: ExplainNodesProps): JSX.Element {
	return (
		<>
			{data.map((row) => {
				const { label, performance } = describeExplainNode(row.detail);

				return (
					<Fragment key={row.id}>
						<div className="h-8 flex gap-2 items-center">
							<div
								className={cn("inline-flex border rounded-full", {
									"bg-green-500": performance === "fast",
									"bg-red-500": performance === "slow",
									"bg-yellow-500": performance === "medium",
									"bg-gray-500": performance === "neutral",
								})}
								style={{ width: 10, height: 10, marginLeft: -5 }}
							/>
							<div>{label}</div>
						</div>
						<div className="pl-4 border-l">
							<ExplainNodes data={row.children} />
						</div>
					</Fragment>
				);
			})}
		</>
	);
}

type ExplainNodePerformance = "slow" | "medium" | "fast" | "neutral";

/**
 * Convert an EXPLAIN step detail string into a UI-friendly
 * description with performance classification and formatted label.
 *
 * Performance indicates execution efficiency:
 *   - slow: likely very costly
 *   - medium: potentially adds extra work
 *   - fast: generally efficient
 *   - neutral: informational only
 *
 * @param detail - The raw detail text from the EXPLAIN result
 *
 * @returns Object containing a ReactNode label and performance level
 */
function describeExplainNode(d: string): {
	label: ReactNode;
	performance: ExplainNodePerformance;
} {
	if (d.startsWith("SCAN ")) {
		return {
			performance: "slow",
			label: (
				<div className="flex items-center">
					<strong>SCAN </strong>
					<span className="border border-color p-1 mx-2 rounded flex items-center gap-2">
						<TableIcon />
						{d.substring("SCAN ".length)}
					</span>
				</div>
			),
		};
	}

	if (d.startsWith("CORRELATED ")) {
		return {
			performance: "slow",
			label: (
				<div>
					<Tooltip
						side="bottom"
						content={
							<div className="flex flex-col gap-2">
								<div>
									This subquery depends on values from the outer query, so
									it&apos;s evaluated once per outer row.{" "}
									<strong className="text-red-500">
										Can be slow on large inputs
									</strong>
									.
								</div>
								<div className="text-green-500">
									Mitigate by indexing the correlated columns or rewriting as a
									JOIN + aggregate.
								</div>
							</div>
						}
					>
						<strong className="underline cursor-pointer">CORRELATED</strong>
					</Tooltip>
					<span>{d.substring("CORRELATED".length)}</span>
				</div>
			),
		};
	}

	if (d.startsWith("SEARCH ")) {
		return {
			performance: "fast",
			label: (
				<div>
					<strong>SEARCH </strong>
					<span>{d.substring("SEARCH".length)}</span>
				</div>
			),
		};
	}

	if (
		d.startsWith("USE TEMP B-TREE FOR ORDER BY") ||
		d.startsWith("USE TEMP B-TREE FOR GROUP BY") ||
		d.startsWith("USE TEMP B-TREE FOR DISTINCT")
	) {
		return {
			performance: "medium",
			label: (
				<Tooltip
					side="bottom"
					content={
						<div className="flex flex-col gap-2">
							<div>
								SQLite can’t return rows in the requested order/grouping
								directly, so it gathers them into a temporary structure and
								processes them before returning results.{" "}
								<span className="text-red-500">
									This adds extra work and grows with result size.
								</span>
							</div>
							<div className="text-green-500">
								Add an index that matches the clause (ORDER BY / GROUP BY /
								DISTINCT) to avoid the temp structure.
							</div>
						</div>
					}
				>
					<strong className="underline cursor-pointer">{d}</strong>
				</Tooltip>
			),
		};
	}

	return {
		label: <span>{d}</span>,
		performance: "neutral",
	};
}
