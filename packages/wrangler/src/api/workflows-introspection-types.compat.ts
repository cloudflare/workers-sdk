/**
 * Compile-time drift guard for the vendored Workflow introspection types in
 * `workflows-introspection-types.ts`.
 *
 * Asserts the vendored types stay structurally interchangeable with the
 * source-of-truth types in `@cloudflare/workflows-shared/src/types`. If those
 * change, this file fails to type-check (via `check:type`), flagging the drift.
 *
 * It is intentionally imported by nothing: keeping the
 * `@cloudflare/workflows-shared/src/types` import out of the entry graph is
 * exactly what lets the vendored types stay decoupled from workflows-shared
 * source in the bundled `.d.ts` output.
 */
import type {
	WorkflowBinding as VendoredWorkflowBinding,
	WorkflowInstanceIntrospector as VendoredWorkflowInstanceIntrospector,
	WorkflowIntrospector as VendoredWorkflowIntrospector,
} from "./workflows-introspection-types";
import type {
	WorkflowBinding as SourceWorkflowBinding,
	WorkflowInstanceIntrospector as SourceWorkflowInstanceIntrospector,
	WorkflowIntrospector as SourceWorkflowIntrospector,
} from "@cloudflare/workflows-shared/src/types";

type IsAssignable<A, B> = [A] extends [B] ? true : false;
type Assert<T extends true> = T;

// Bidirectional assignability — errors if either direction breaks.
export type _WorkflowBindingForward = Assert<
	IsAssignable<VendoredWorkflowBinding, SourceWorkflowBinding>
>;
export type _WorkflowBindingBackward = Assert<
	IsAssignable<SourceWorkflowBinding, VendoredWorkflowBinding>
>;
export type _WorkflowInstanceIntrospectorForward = Assert<
	IsAssignable<
		VendoredWorkflowInstanceIntrospector,
		SourceWorkflowInstanceIntrospector
	>
>;
export type _WorkflowInstanceIntrospectorBackward = Assert<
	IsAssignable<
		SourceWorkflowInstanceIntrospector,
		VendoredWorkflowInstanceIntrospector
	>
>;
export type _WorkflowIntrospectorForward = Assert<
	IsAssignable<VendoredWorkflowIntrospector, SourceWorkflowIntrospector>
>;
export type _WorkflowIntrospectorBackward = Assert<
	IsAssignable<SourceWorkflowIntrospector, VendoredWorkflowIntrospector>
>;
