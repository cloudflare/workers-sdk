import { NodeGroup } from "../../cloudchamber/client";
import type {
	Deployment,
	PlacementWithEvents,
} from "../../cloudchamber/client";

export const MOCK_DEPLOYMENTS = [
	{
		id: "1",
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 1,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.1",
		current_placement: null,
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "2",
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 2,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.2",
		current_placement: {
			deployment_version: 2,
			status: { health: "running" },
			deployment_id: "2",
			terminate: false,
			created_at: "123",
			id: "1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
] as Deployment[];

export const MOCK_DEPLOYMENTS_COMPLEX = [
	{
		id: "1",
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 1,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.1",
		current_placement: null,
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "2",
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 2,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.2",
		current_placement: {
			deployment_version: 2,
			status: { health: "running" },
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
		created_at: "123",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 1,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.1",
		current_placement: null,
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
	{
		id: "4",
		created_at: "1234",
		account_id: "123",
		vcpu: 4,
		memory: "400MB",
		version: 2,
		image: "hello",
		location: "sfo06",
		ipv4: "1.1.1.2",
		current_placement: {
			deployment_version: 2,
			status: { health: "running" },
			deployment_id: "2",
			terminate: false,
			created_at: "123",
			id: "1",
		},
		placements_ref: "http://ref",
		node_group: NodeGroup.METAL,
	},
] as Deployment[];

export const MOCK_PLACEMENTS = [
	{
		id: "2",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 2,
		terminate: false,
		events: [],
		status: { health: "stopped" },
	},
	{
		id: "3",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 3,
		terminate: false,
		events: [],
		status: { health: "failed" },
	},
	{
		id: "1",
		created_at: "123",
		deployment_id: "1",
		deployment_version: 4,
		terminate: false,
		events: [],
		status: { health: "running" },
	},
] as PlacementWithEvents[];
