import { OpenAPI, requestPaginated } from "./client";
import type {
	ApplicationID,
	CancelablePromise,
	Image,
	ISO8601Timestamp,
	LocationID,
	PaginatedResult,
	Region,
} from "./client";

export type ContainerInstanceStatusState =
	| "provisioning"
	| "running"
	| "failed"
	| "stopping"
	| "stopped"
	| "unhealthy"
	| "inactive"
	| "unknown";

export type ContainerInstance = {
	id: string;
	application_id: ApplicationID;
	name?: string;
	started_at?: ISO8601Timestamp;
	status: {
		state: ContainerInstanceStatusState;
		updated_at: ISO8601Timestamp;
		exit_code?: number;
	};
	location?: {
		name: LocationID;
		region: Region;
	};
	image: Image;
	configuration?: {
		vcpu: number;
		memory: number;
		disk: number;
	};
};

export type ContainersListContainerInstances = {
	instances: ContainerInstance[];
};

/**
 * List the canonical runtime instances for a container application.
 *
 * @param applicationId Container application identifier.
 * @param perPage Maximum number of instances returned on this page.
 * @param pageToken Continuation token from the previous page.
 * @param state Optional active or non-active lifecycle filter.
 * @param namePrefix Optional case-sensitive instance-name prefix.
 * @returns The instance page and its pagination metadata.
 */
export function listContainerInstances(
	applicationId: ApplicationID,
	perPage?: number,
	pageToken?: string,
	state?: "active" | "not-active",
	namePrefix?: string
): CancelablePromise<PaginatedResult<ContainersListContainerInstances>> {
	return requestPaginated(OpenAPI, {
		method: "GET",
		url: "/applications/{application_id}/instances",
		path: {
			application_id: applicationId,
		},
		query: {
			per_page: perPage,
			page_token: pageToken,
			state,
			name_prefix: namePrefix,
		},
		errors: {
			400: "Invalid request",
			401: "Unauthorized",
			404: "Application not found",
			500: "Internal error",
		},
	});
}
