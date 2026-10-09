import { compare } from "./compare";
import { runScenarios } from "./scenarios";
import type { Mismatch } from "./compare";
import type { ArtifactsBinding, PrepareFixture } from "./scenarios";

export interface LiveComparisonOptions {
	/** Must be explicitly authorized as disposable by its owner. This code cannot establish ownership. */
	namespace: string;
	approvedDisposableNamespace: string;
	fixturePrefix: string;
	approvedDisposableFixturePrefix: string;
	confirmation: "I_APPROVE_DISPOSABLE_ARTIFACTS_COMPARISON";
	local: ArtifactsBinding;
	live: ArtifactsBinding;
	prepareLocalFixture: PrepareFixture;
	prepareLiveFixture: PrepareFixture;
}

/** Opt-in only; bindings and secret-bearing Git setup must be provided inside a trusted test context. No provisioning or HTTP endpoint. */
export async function runApprovedLiveComparison(
	options: LiveComparisonOptions
): Promise<Mismatch[]> {
	if (
		options.confirmation !== "I_APPROVE_DISPOSABLE_ARTIFACTS_COMPARISON" ||
		!options.namespace ||
		options.namespace !== options.approvedDisposableNamespace ||
		options.fixturePrefix !== options.approvedDisposableFixturePrefix ||
		!/^[a-z][a-z0-9-]{7,40}-$/.test(options.fixturePrefix)
	) {
		throw new Error(
			"Comparison requires explicit approval of a disposable namespace and a scoped fixture prefix"
		);
	}
	if (options.local === options.live) {
		throw new Error("Local and live bindings must be distinct");
	}
	// The namespace owner must reserve the prefix; runScenarios refuses a nonempty namespace.
	const local = await runScenarios(
		options.local,
		options.fixturePrefix,
		options.prepareLocalFixture
	);
	const live = await runScenarios(
		options.live,
		options.fixturePrefix,
		options.prepareLiveFixture
	);
	return compare(local, live);
}
