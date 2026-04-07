/**
 * Workflow DAG Parser for Local Development
 *
 * Uses the Rust visualizer-controller (compiled to WASM) to perform static
 * analysis on bundled worker source code and extract a DAG (Directed Acyclic
 * Graph) representing each workflow's step structure.
 *
 * The WASM binary is vendored from the Workflows team's visualizer-controller
 * package, ensuring exact parity with the production diagram.
 */

import { parseDag } from "../../vendor/workflow-dag-parser/index";
import type { DagPayload, WorkflowEntrypointDag } from "./dag-types";

interface RustParserResult {
	success: boolean;
	v?: number;
	workflows?: WorkflowEntrypointDag[];
	error?: string;
}

/**
 * Parse workflow source code and extract DAG for each workflow class.
 *
 * @param source - The bundled JavaScript source code (esbuild output)
 * @param workflowClassNames - Map of workflow name to class name to extract
 * @returns Map of workflow name to DagPayload, or empty map if parsing fails
 */
export function parseWorkflowDags(
	source: string,
	workflowClassNames: Map<string, string>
): Map<string, DagPayload> {
	const results = new Map<string, DagPayload>();

	let parsed: RustParserResult;
	try {
		const json = parseDag(source);
		const raw: unknown = JSON.parse(json);
		if (
			typeof raw !== "object" ||
			raw === null ||
			!("success" in raw) ||
			typeof (raw as Record<string, unknown>).success !== "boolean"
		) {
			return results;
		}
		parsed = raw as RustParserResult;
	} catch {
		return results;
	}

	if (!parsed.success || !Array.isArray(parsed.workflows)) {
		return results;
	}

	// Build a reverse map: className -> workflowName
	const classToName = new Map<string, string>();
	for (const [workflowName, className] of workflowClassNames) {
		classToName.set(className, workflowName);
	}

	// Match discovered workflows to requested class names
	for (const workflow of parsed.workflows) {
		const workflowName = classToName.get(workflow.class_name);
		if (!workflowName) {
			continue;
		}

		results.set(workflowName, {
			version: parsed.v ?? 1,
			workflow,
		});
	}

	return results;
}
