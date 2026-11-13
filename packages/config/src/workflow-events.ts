/** Event types Artifacts publishes to subscriptions. */
export const ARTIFACTS_EVENT_TYPES = [
	"cf.artifacts.repo.created",
	"cf.artifacts.repo.deleted",
	"cf.artifacts.repo.forked",
	"cf.artifacts.repo.imported",
	"cf.artifacts.repo.pushed",
	"cf.artifacts.repo.cloned",
	"cf.artifacts.repo.fetched",
	"cf.artifacts.repo.token.created",
	"cf.artifacts.repo.token.revoked",
] as const;

/** A published Artifacts event type. */
export type ArtifactsEventType = (typeof ARTIFACTS_EVENT_TYPES)[number];

/** An Artifacts event that starts the Workflow declaring it. */
export interface WorkflowEvent {
	type: ArtifactsEventType;
	filter?: { namespace?: string; repoName?: string };
}
