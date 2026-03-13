import {
	ContainerNetworkMode,
	DeploymentType,
	NodeGroup,
	PlacementStatusHealth,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import type {
	Application,
	DashApplication,
	DeploymentV2,
	PlacementWithEvents,
} from "@cloudflare/containers-shared";

export const MOCK_DEPLOYMENTS: DeploymentV2[] = [
	{
		id: "1",
		type: DeploymentType.DEFAULT,
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 1,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "2",
		type: DeploymentType.DEFAULT,
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 2,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.2",
		},
		current_placement: {
			deployment_version: 2,
			status: { health: PlacementStatusHealth.RUNNING },
			deployment_id: "2",
			terminate: false,
			created_at: "123",
			id: "1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
];

export const MOCK_DEPLOYMENTS_COMPLEX: DeploymentV2[] = [
	{
		id: "1",
		type: DeploymentType.DEFAULT,
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 1,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "2",
		type: DeploymentType.DEFAULT,
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 2,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.2",
		},
		current_placement: {
			deployment_version: 2,
			status: { health: PlacementStatusHealth.RUNNING },
			deployment_id: "2",
			terminate: false,
			created_at: "123",
			id: "1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "3",
		type: DeploymentType.DEFAULT,
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 1,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "4",
		type: DeploymentType.DEFAULT,
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		memory_mib: 400,
		version: 2,
		image: "hello",
		location: {
			name: "sfo06",
			enabled: true,
		},
		network: {
			mode: ContainerNetworkMode.PUBLIC,
			ipv4: "1.1.1.2",
		},
		current_placement: {
			deployment_version: 2,
			status: { health: PlacementStatusHealth.RUNNING },
			deployment_id: "2",
			terminate: false,
			created_at: "123",
			id: "1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
];

export const MOCK_PLACEMENTS: PlacementWithEvents[] = [
	{
		id: "2",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 2,
		terminate: false,
		events: [],
		status: { health: PlacementStatusHealth.STOPPED },
	},
	{
		id: "3",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 3,
		terminate: false,
		events: [],
		status: { health: PlacementStatusHealth.FAILED },
	},
	{
		id: "1",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 4,
		terminate: false,
		events: [],
		status: { health: PlacementStatusHealth.RUNNING },
	},
];

export const MOCK_APPLICATIONS: Application[] = [
	{
		id: "asdf-2",
		created_at: "123",
		account_id: "test-account",
		name: "Test-app",
		version: 1,
		configuration: {
			image: "test-registry.cfdata.org/test-app:v1",
			network: {
				mode: ContainerNetworkMode.PRIVATE,
			},
		},
		scheduling_policy: SchedulingPolicy.REGIONAL,
		instances: 2,
		jobs: false,
		constraints: { region: "WNAM" },
	},
	{
		id: "asdf-1",
		created_at: "123",
		account_id: "test-account",
		name: "Test-app",
		version: 1,
		configuration: {
			image: "test-registry.cfdata.org/test-app:v10",
			network: {
				mode: ContainerNetworkMode.PRIVATE,
			},
		},
		scheduling_policy: SchedulingPolicy.REGIONAL,
		instances: 10,
		jobs: false,
		constraints: { region: "WNAM" },
	},
	{
		id: "asdf-3",
		created_at: "123",
		account_id: "test-account",
		name: "Test-app",
		version: 1,
		configuration: {
			image: "test-registry.cfdata.org/test-app:v2",
			network: {
				mode: ContainerNetworkMode.PRIVATE,
			},
		},
		scheduling_policy: SchedulingPolicy.REGIONAL,
		instances: 2,
		jobs: false,
		constraints: { region: "WNAM" },
	},
];

// Covers all four derived states: active, degraded, provisioning, ready
export const MOCK_DASH_APPLICATIONS: DashApplication[] = [
	{
		id: "aaaaaaaa-1111-1111-1111-111111111111",
		created_at: "2025-06-01T10:00:00Z",
		updated_at: "2025-06-10T12:00:00Z",
		name: "my-active-app",
		version: 3,
		instances: 2,
		image: "registry.cfdata.org/my-active-app:v3",
		health: {
			instances: {
				active: 2,
				healthy: 2,
				failed: 0,
				starting: 0,
				scheduling: 0,
			},
		},
	},
	{
		id: "bbbbbbbb-2222-2222-2222-222222222222",
		created_at: "2025-06-02T08:00:00Z",
		updated_at: "2025-06-11T09:30:00Z",
		name: "my-degraded-app",
		version: 5,
		instances: 3,
		image: "registry.cfdata.org/my-degraded-app:v5",
		health: {
			instances: {
				active: 1,
				healthy: 1,
				failed: 2,
				starting: 0,
				scheduling: 0,
			},
		},
	},
	{
		id: "cccccccc-3333-3333-3333-333333333333",
		created_at: "2025-06-03T14:00:00Z",
		updated_at: "2025-06-12T16:45:00Z",
		name: "my-provisioning-app",
		version: 1,
		instances: 4,
		image: "registry.cfdata.org/my-provisioning-app:v1",
		health: {
			instances: {
				active: 0,
				healthy: 0,
				failed: 0,
				starting: 2,
				scheduling: 2,
			},
		},
	},
	{
		id: "dddddddd-4444-4444-4444-444444444444",
		created_at: "2025-06-04T06:00:00Z",
		updated_at: "2025-06-13T07:15:00Z",
		name: "my-ready-app",
		version: 2,
		instances: 0,
		image: "registry.cfdata.org/my-ready-app:v2",
		health: {
			instances: {
				active: 0,
				healthy: 0,
				failed: 0,
				starting: 0,
				scheduling: 0,
			},
		},
	},
];
