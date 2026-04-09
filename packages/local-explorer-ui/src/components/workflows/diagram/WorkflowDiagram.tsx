import { Button, cn } from "@cloudflare/kumo";
import { CaretDown } from "@phosphor-icons/react";
import {
	AnimatePresence,
	motion,
	useAnimationFrame,
	useMotionValue,
} from "motion/react";
import {
	Fragment,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import {
	ConnectionLabel,
	Connector,
	MergeConnector,
	ParallelNodeWrapper,
	SimpleConnector,
} from "./connectors";
import { DiagramProvider, useDiagramContext } from "./context";
import { Step as StaticStep, StepConnector, StepWrapper } from "./step";
import { transitions } from "./transitions";
import type {
	BaseBranch,
	FunctionCall,
	FunctionDef,
	IfNode,
	LoopNode,
	Node,
	ParallelNode,
	StepNode,
	SwitchNode,
	TryNode,
	WorkflowEntrypoint,
} from "./types";

function ExpandableStep({
	trigger,
	children,
	open,
	showFooter = false,
}: {
	trigger: ReactNode;
	children: ReactNode;
	open: boolean;
	showFooter?: boolean;
}) {
	const expanded = open;
	const { setIsAnimating } = useDiagramContext();

	const [containerBox, setContainerBox] = useState<
		{ width: number; height: number } | undefined
	>();

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		const box = containerRef.current.getBoundingClientRect();
		setContainerBox({ width: box.width, height: box.height });
	}, []);

	return (
		<div>
			<div className="relative flex flex-col-reverse items-center">
				<motion.div
					ref={containerRef}
					className={cn(
						"flex items-start justify-center overflow-hidden rounded-2xl border border-dashed border-kumo-fill bg-(--color-background)",
						containerBox
							? "relative"
							: "absolute -inset-[9px] -top-1 -bottom-[3px]"
					)}
					style={
						{
							"--color-background": "var(--color-kumo-elevated)",
						} as Record<string, string>
					}
					animate={
						containerBox
							? expanded
								? {
										height: "auto",
										width: "auto",
										marginTop: -16,
									}
								: {
										...containerBox,
										marginTop: -containerBox.height + 3,
									}
							: false
					}
					transition={transitions.swift}
					onAnimationStart={() => setIsAnimating(true)}
					onAnimationComplete={() => setIsAnimating(false)}
					aria-hidden={!expanded}
				>
					<AnimatePresence>
						{expanded && (
							<motion.div
								className="flex w-max flex-col items-center px-5 pb-4"
								exit={{ opacity: 0 }}
								transition={transitions.swift}
							>
								{children}
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
				{trigger}
			</div>
			{showFooter && (
				<motion.div
					animate={{
						marginTop: expanded ? -29 : containerBox ? -15 : -6,
					}}
					initial={{ marginTop: -6 }}
					transition={transitions.swift}
					className="relative z-10 mx-auto size-3 rounded border border-kumo-fill bg-kumo-base"
				/>
			)}
		</div>
	);
}

function WorkflowFunctionNode({
	node,
	functionDef,
}: {
	node: FunctionCall;
	functionDef: FunctionDef;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<ExpandableStep
			trigger={
				<StepWrapper type="function call" variant="static">
					<Button
						className="h-[35px] w-full gap-2.5 rounded-t-none"
						variant="ghost"
						onClick={() => setExpanded(!expanded)}
					>
						<span className="flex grow items-center gap-2">
							<span className="font-mono">{node.name}()</span>
							<span className="h-4 w-4 shrink-0 rounded bg-kumo-contrast text-xs text-kumo-base">
								{functionDef.nodes.length}
							</span>
						</span>
						<span className="-mr-3 flex h-full w-8 items-center justify-center border-l border-kumo-fill">
							<motion.span
								className="flex items-center justify-center"
								animate={{ rotate: expanded ? 180 : 0 }}
								transition={transitions.swift}
							>
								<CaretDown size={16} />
							</motion.span>
						</span>
					</Button>
				</StepWrapper>
			}
			open={expanded}
			showFooter
		>
			<WorkflowNodeList showFirst nodes={node.nodes || functionDef.nodes} />
		</ExpandableStep>
	);
}

const isNodeParallel = (node?: Node): boolean => {
	if (!node) {
		return false;
	}
	if (isStepNode(node)) {
		return false;
	}
	if (node.type === "loop") {
		return false;
	}

	if (node.type === "switch") {
		return node.branches.length > 1;
	}

	if (node.type === "if") {
		const [firstBranch] = node.branches;
		if (node.branches.length > 1) {
			return true;
		}
		return firstBranch?.condition !== "else";
	}

	if (node.type === "parallel") {
		return node.nodes.length > 1;
	}

	if (node.type === "try") {
		return !node.finally_block;
	}

	if ("nodes" in node) {
		const lastNode = node.nodes?.at(-1);
		return isNodeParallel(lastNode);
	}
	return false;
};

function hasSteps(
	node: Node,
	functions?: Record<string, FunctionDef>,
	visitedFunctions: Set<string> = new Set()
): boolean {
	if (isStepNode(node)) {
		return true;
	}
	// Check function_call BEFORE "nodes" in node — FunctionCall has an optional
	// nodes property, and the `in` operator returns true even for undefined values,
	// which would short-circuit the function definition lookup.
	if (node.type === "function_call") {
		if (visitedFunctions.has(node.name)) {
			return false; // Cycle detected — prevent infinite recursion
		}
		visitedFunctions.add(node.name);
		const definition = functions?.[node.name];
		if (!definition) {
			return false;
		}
		return definition.nodes.some((n) =>
			hasSteps(n, functions, visitedFunctions)
		);
	}
	if (node.type === "try") {
		return (
			(node.try_block?.nodes.some((n) =>
				hasSteps(n, functions, visitedFunctions)
			) ||
				node.catch_block?.nodes.some((n) =>
					hasSteps(n, functions, visitedFunctions)
				) ||
				node.finally_block?.nodes.some((n) =>
					hasSteps(n, functions, visitedFunctions)
				)) ??
			false
		);
	}
	if ("branches" in node) {
		return node.branches.some((branch) =>
			branch.nodes.some((n) => hasSteps(n, functions, visitedFunctions))
		);
	}
	if ("nodes" in node) {
		return (
			node.nodes?.some((n) => hasSteps(n, functions, visitedFunctions)) ?? false
		);
	}
	return false;
}

function WorkflowNodeList({
	showFirst = false,
	nodes,
}: {
	showFirst?: boolean;
	nodes: Node[];
}) {
	const { functions } = useDiagramContext();
	if (!nodes.length) {
		return null;
	}
	return (
		<ul className="ml-0 flex list-none flex-col items-center">
			{nodes.map((node, index) => {
				if (!hasSteps(node, functions)) {
					return null;
				}
				const before = nodes[index - 1];
				const isParallel = isNodeParallel(node);
				const isBeforeParallel = isNodeParallel(before);
				const showConnector =
					showFirst || (before && !isParallel && !isBeforeParallel);
				return (
					<Fragment key={index}>
						{showConnector && <SimpleConnector />}
						<li>
							<WorkflowNode node={node} />
						</li>
					</Fragment>
				);
			})}
		</ul>
	);
}

function ParallelBranches({
	branches,
	showMergeConnectors = true,
}: {
	branches: (BaseBranch & { label?: ReactNode })[];
	showMergeConnectors?: boolean;
}) {
	const ref = useRef<HTMLUListElement>(null);
	const groupCenter = useMotionValue(0);
	const { isAnimating } = useDiagramContext();

	useEffect(() => {
		if (!ref.current) {
			return;
		}
		const { x, width } = ref.current.getBoundingClientRect();
		groupCenter.set(x + width / 2);
	}, [groupCenter]);

	useAnimationFrame(() => {
		if (!isAnimating || !ref.current) {
			return;
		}
		const { x, width } = ref.current.getBoundingClientRect();
		groupCenter.set(x + width / 2);
	});

	return (
		<div>
			{showMergeConnectors && <MergeConnector />}
			<ul ref={ref} className="relative z-10 ml-0 flex list-none">
				{branches.map((branchNode, i) => {
					return (
						<ParallelNodeWrapper
							label={branchNode.label}
							index={i}
							total={branches.length}
							key={i}
							groupCenter={groupCenter}
						>
							<WorkflowNodeList nodes={branchNode.nodes} />
						</ParallelNodeWrapper>
					);
				})}
			</ul>
			{showMergeConnectors && <MergeConnector isBottom />}
		</div>
	);
}

type ParallelBranch = {
	node: Node;
	childBranches: ParallelBranch[];
};

function buildParallelTree(allNodes: Node[]): ParallelBranch[] {
	const nodesByStarts = new Map<number, Node[]>();
	for (const node of allNodes) {
		const starts = ("starts" in node && node.starts) || 1;
		let group = nodesByStarts.get(starts);
		if (!group) {
			group = [];
			nodesByStarts.set(starts, group);
		}
		group.push(node);
	}

	const startsValues = Array.from(nodesByStarts.keys()).sort(
		(a: number, b: number) => a - b
	);
	if (startsValues.length === 0) {
		return [];
	}

	const lastResolverForValue = new Map<number, Node>();
	for (const node of allNodes) {
		const resolves = "resolves" in node ? node.resolves : undefined;
		if (resolves !== undefined) {
			lastResolverForValue.set(resolves, node);
		}
	}

	const assignedNodes = new Set<Node>();

	function buildBranch(node: Node): ParallelBranch {
		const resolves = "resolves" in node ? node.resolves : undefined;
		let childBranches: ParallelBranch[] = [];

		if (resolves !== undefined) {
			const isLastResolver = lastResolverForValue.get(resolves) === node;

			if (isLastResolver) {
				const childNodes = nodesByStarts.get(resolves) ?? [];
				const unassignedChildren = childNodes.filter(
					(n) => !assignedNodes.has(n)
				);
				unassignedChildren.forEach((n) => assignedNodes.add(n));
				childBranches = unassignedChildren.map(buildBranch);
			}
		}

		return { node, childBranches };
	}

	const firstWaveStarts = startsValues[0] ?? 1;
	const firstWaveNodes = nodesByStarts.get(firstWaveStarts) ?? [];

	return firstWaveNodes.map(buildBranch);
}

function ParallelBranchNode({ branch }: { branch: ParallelBranch }) {
	const { node, childBranches } = branch;

	if (childBranches.length === 0) {
		return <WorkflowNode node={node} />;
	}

	const firstChild = childBranches[0];
	return (
		<div className="flex flex-col items-center">
			<WorkflowNode node={node} />
			<SimpleConnector />
			{childBranches.length === 1 && firstChild ? (
				<ParallelBranchNode branch={firstChild} />
			) : (
				<ParallelBranchesWithTree branches={childBranches} />
			)}
		</div>
	);
}

function WorkflowParallelNode({ node }: { node: ParallelNode }) {
	const branches = buildParallelTree(node.nodes);
	const firstBranch = branches[0];

	if (
		branches.length === 1 &&
		firstBranch &&
		firstBranch.childBranches.length === 0
	) {
		return <WorkflowNode node={firstBranch.node} />;
	}

	if (branches.length === 1 && firstBranch) {
		return (
			<div>
				<MergeConnector />
				<ParallelBranchNode branch={firstBranch} />
				<MergeConnector isBottom />
			</div>
		);
	}

	return <ParallelBranchesWithTree branches={branches} />;
}

function ParallelBranchesWithTree({
	branches,
}: {
	branches: ParallelBranch[];
}) {
	const ref = useRef<HTMLUListElement>(null);
	const groupCenter = useMotionValue(0);
	const { isAnimating } = useDiagramContext();

	useEffect(() => {
		if (!ref.current) {
			return;
		}
		const { x, width } = ref.current.getBoundingClientRect();
		groupCenter.set(x + width / 2);
	}, [groupCenter]);

	useAnimationFrame(() => {
		if (!isAnimating || !ref.current) {
			return;
		}
		const { x, width } = ref.current.getBoundingClientRect();
		groupCenter.set(x + width / 2);
	});

	return (
		<div>
			<MergeConnector />
			<ul ref={ref} className="relative z-10 ml-0 flex list-none">
				{branches.map((branch, i) => (
					<ParallelNodeWrapper
						index={i}
						total={branches.length}
						key={i}
						groupCenter={groupCenter}
					>
						<ParallelBranchNode branch={branch} />
					</ParallelNodeWrapper>
				))}
			</ul>
			<MergeConnector isBottom />
		</div>
	);
}

function WorkflowSwitchNode({ node }: { node: SwitchNode }) {
	const branches = node.branches.map((b) => ({
		...b,
		label: b.condition ?? "default",
	}));
	const first = branches[0];
	if (branches.length === 1 && first) {
		return (
			<div>
				<ConnectionLabel>{first.label}</ConnectionLabel>
				<WorkflowNodeList nodes={first.nodes} />
			</div>
		);
	}
	return <ParallelBranches branches={branches} />;
}

function WorkflowIfNode({ node }: { node: IfNode }) {
	const branches = node.branches.map((b) => ({
		...b,
		label: b.condition ?? "else",
	}));
	const first = branches[0];
	if (branches.length === 1 && first) {
		if (first.label === "else") {
			return (
				<div>
					<ConnectionLabel>else</ConnectionLabel>
					<WorkflowNodeList nodes={first.nodes} />
				</div>
			);
		} else {
			branches.push({ nodes: [], label: "else", condition: null });
		}
	}
	return <ParallelBranches branches={branches} />;
}

function WorkflowTryCatchNode({ node }: { node: TryNode }) {
	const tryBranch = node.try_block?.nodes ?? [];
	const catchBranch = node.catch_block?.nodes ?? [];
	const finallyBranch = node.finally_block?.nodes ?? [];

	const hasTryNodes = tryBranch.length > 0;
	const hasCatchNodes = catchBranch.length > 0;
	const hasFinallyNodes = finallyBranch.length > 0;

	if (hasFinallyNodes && !hasTryNodes && !hasCatchNodes) {
		return <WorkflowNodeList nodes={finallyBranch} />;
	}

	return (
		<>
			<div className="relative">
				<MergeConnector variant="left" />
				<ul className="ml-0 flex list-none">
					<li className="flex min-w-16 flex-col">
						<Connector position="left" />
						<div className="relative">
							<div className="absolute top-2.5 right-0 left-1/2 h-0.5 bg-(--color-connector)" />
							<ConnectionLabel>try</ConnectionLabel>
						</div>
						{hasTryNodes && (
							<div className="-mt-1 -mb-px rounded-3xl border border-dashed border-(--color-connector)">
								<SimpleConnector isBottom height={12} />
								<div className="px-4">
									<WorkflowNodeList nodes={tryBranch} />
								</div>
								<SimpleConnector isBottom height={12} />
							</div>
						)}
						<SimpleConnector isBottom shrink />
						<Connector isBottom position="left" />
					</li>
					<li className="flex min-w-16 flex-col">
						<div className="h-[calc(var(--connector-height)/2)]" />
						<div className="relative">
							<div className="absolute top-2 right-1/2 left-0 h-0.5 bg-(--color-connector)" />
							<ConnectionLabel>catch</ConnectionLabel>
							<SimpleConnector isBottom height={7} />
						</div>
						<div className="px-4">
							<WorkflowNodeList nodes={catchBranch} />
						</div>
						<SimpleConnector isBottom shrink />
						<Connector isBottom position="right" />
					</li>
				</ul>
				<MergeConnector isBottom />
			</div>
			{hasFinallyNodes && <WorkflowNodeList nodes={finallyBranch} />}
		</>
	);
}

function WorkflowLoopNode({ node }: { node: LoopNode }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div
			className={cn("relative", expanded && "mx-4")}
			style={
				{
					"--color-background": "var(--color-kumo-elevated)",
				} as CSSProperties
			}
		>
			{expanded && (
				<div
					className={cn(
						"absolute top-[15px] right-0 bottom-[5px] rounded-2xl border border-dashed border-kumo-fill bg-(--color-background)",
						expanded ? "-right-4 -left-4" : "-right-3 -left-3"
					)}
				/>
			)}
			<div
				className={cn(
					"absolute top-[15px] right-1/2 bottom-[5px] rounded-l-2xl border-2 border-r-0 border-(--color-connector)",
					expanded ? "-left-4" : "-left-3"
				)}
			/>
			<Button
				className={cn(
					"relative z-10 mx-auto h-8 w-fit gap-2.5 ring ring-kumo-fill",
					expanded && "-mb-6"
				)}
				onClick={() => setExpanded(!expanded)}
			>
				<span className="absolute right-full h-2.5 w-[5px] rounded-l-xs bg-(--color-connector)" />
				<span className="flex grow items-center gap-2">
					<span className="font-mono">loop</span>
					<span className="h-4 w-4 shrink-0 rounded bg-kumo-contrast text-xs text-kumo-base">
						{node.nodes.length}
					</span>
				</span>
				<span className="-mr-3 flex h-full w-8 items-center justify-center border-l border-kumo-fill">
					<motion.span
						className="flex items-center justify-center"
						animate={{ rotate: expanded ? 180 : 0 }}
						transition={transitions.swift}
					>
						<CaretDown size={16} />
					</motion.span>
				</span>
			</Button>
			{expanded && (
				<div className="relative">
					<WorkflowNodeList showFirst nodes={node.nodes} />
					<div className="mx-auto h-3 w-0.5 bg-(--color-connector)" />
					<StepConnector />
				</div>
			)}
		</div>
	);
}

function isStepNode(node: Node): node is StepNode {
	return (
		node.type === "step_do" ||
		node.type === "step_sleep" ||
		node.type === "step_sleep_until" ||
		node.type === "step_wait_for_event"
	);
}

function getStepType(node: StepNode): "do" | "sleep" | "waitForEvent" {
	switch (node.type) {
		case "step_do":
			return "do";
		case "step_sleep":
		case "step_sleep_until":
			return "sleep";
		case "step_wait_for_event":
			return "waitForEvent";
	}
}

function WorkflowNode({ node }: { node: Node }) {
	const { functions } = useDiagramContext();

	if (isStepNode(node)) {
		return (
			<StaticStep
				node={{
					name: node.name,
					type: getStepType(node),
				}}
			/>
		);
	}

	if (node.type === "function_call") {
		const functionDef = functions[node.name];
		if (!functionDef) {
			return null;
		}
		return <WorkflowFunctionNode node={node} functionDef={functionDef} />;
	}

	if (node.type === "parallel") {
		return <WorkflowParallelNode node={node} />;
	}

	if (node.type === "if") {
		return <WorkflowIfNode node={node} />;
	}

	if (node.type === "switch") {
		return <WorkflowSwitchNode node={node} />;
	}

	if (node.type === "try") {
		return <WorkflowTryCatchNode node={node} />;
	}

	if (node.type === "loop") {
		return <WorkflowLoopNode node={node} />;
	}

	// Break/return nodes have no visual representation in the diagram —
	// they affect control flow but are not rendered as step cards.
	return null;
}

export function WorkflowDiagram({
	workflow,
}: {
	workflow: WorkflowEntrypoint;
}) {
	return (
		<DiagramProvider functions={workflow.functions}>
			<div
				className="relative mx-auto w-fit"
				style={
					{
						"--connector-height": "50px",
						"--color-connector": "#a1a1a1",
						"--color-connector-active": "var(--color-kumo-interact)",
						"--color-background": "var(--color-kumo-elevated)",
					} as CSSProperties
				}
			>
				<div>
					<StepConnector />
					<div className="mx-auto h-3 w-0.5 bg-(--color-connector)" />
				</div>
				<WorkflowNodeList nodes={workflow.nodes} />
				<div>
					<div className="mx-auto h-3 w-0.5 bg-(--color-connector)" />
					<div className="relative z-10 mx-auto size-2.5 rounded border border-current bg-current text-(--color-connector)" />
				</div>
			</div>
		</DiagramProvider>
	);
}
