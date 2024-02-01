import { rest } from "msw";
import { a } from "msw/lib/SetupApi-b2f0e5ac";
import patchConsole from "patch-console";
import {
	CompleteAccountCustomer,
	CustomerImageRegistry,
	NodeGroup,
	SSHPublicKeyItem,
} from "../../cloudchamber/client";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber create", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should show account information (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.get("*/ssh-public-keys", async (_request, response, context) => {
				const keys = [
					{ id: "1", name: "hello", public_key: "hello-world" },
				] as SSHPublicKeyItem[];
				return response.once(context.json(keys));
			})
		);
		msw.use(
			rest.get("*/me", async (_request, response, context) => {
				return response.once(
					context.json({
						external_account_id: "123",
						legacy_identity: "abc",
						limits: {
							account_id: "123",
							vcpu_per_deployment: 1,
							total_vcpu: 2,
							memory_per_deployment: "128MB",
							total_memory: "1GB",
							network_modes: [],
							node_group: NodeGroup.METAL,
						},
						locations: [
							{
								name: "My Location",
								location: "hello",
								region: "World",
								limits: {
									vcpu_per_deployment: 1,
									total_vcpu: 2,
									memory_per_deployment: "128MB",
									total_memory: "1GB",
								},
							},
						],
						defaults: {
							vcpus: 2,
							memory: "128MB",
						},
					} as CompleteAccountCustomer)
				);
			})
		);
		msw.use(
			rest.get("*/registries", async (_request, response, context) => {
				return response.once(
					context.json([
						{
							domain: "hello.com",
							public_key: "hello-world",
							created_at: "2024-02-01T15:41:57.542Z",
						},
					] as CustomerImageRegistry[])
				);
			})
		);

		await runWrangler("cloudchamber whoami --json");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(
			`"{\\"account\\":{\\"external_account_id\\":\\"123\\",\\"legacy_identity\\":\\"abc\\",\\"limits\\":{\\"account_id\\":\\"123\\",\\"vcpu_per_deployment\\":1,\\"total_vcpu\\":2,\\"memory_per_deployment\\":\\"128MB\\",\\"total_memory\\":\\"1GB\\",\\"network_modes\\":[],\\"node_group\\":\\"metal\\"},\\"locations\\":[{\\"name\\":\\"My Location\\",\\"location\\":\\"hello\\",\\"region\\":\\"World\\",\\"limits\\":{\\"vcpu_per_deployment\\":1,\\"total_vcpu\\":2,\\"memory_per_deployment\\":\\"128MB\\",\\"total_memory\\":\\"1GB\\"}}],\\"defaults\\":{\\"vcpus\\":2,\\"memory\\":\\"128MB\\"}},\\"registries\\":[{\\"domain\\":\\"hello.com\\",\\"public_key\\":\\"hello-world\\",\\"created_at\\":\\"2024-02-01T15:41:57.542Z\\"}],\\"ssh\\":[{\\"id\\":\\"1\\",\\"name\\":\\"hello\\",\\"public_key\\":\\"hello-world\\"}]}"`
		);
	});

	it("should show the error if one endpoint fails (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.get("*/ssh-public-keys", async (_request, response, context) => {
				return response.once(
					context.json({ error: "INTERNAL_ERROR" }),
					context.status(400)
				);
			})
		);
		msw.use(
			rest.get("*/me", async (_request, response, context) => {
				return response.once(
					context.json({
						external_account_id: "123",
						legacy_identity: "abc",
						limits: {
							account_id: "123",
							vcpu_per_deployment: 1,
							total_vcpu: 2,
							memory_per_deployment: "128MB",
							total_memory: "1GB",
							network_modes: [],
							node_group: NodeGroup.METAL,
						},
						locations: [
							{
								name: "My Location",
								location: "hello",
								region: "World",
								limits: {
									vcpu_per_deployment: 1,
									total_vcpu: 2,
									memory_per_deployment: "128MB",
									total_memory: "1GB",
								},
							},
						],
						defaults: {
							vcpus: 2,
							memory: "128MB",
						},
					} as CompleteAccountCustomer)
				);
			})
		);
		msw.use(
			rest.get("*/registries", async (_request, response, context) => {
				return response.once(
					context.json([
						{
							domain: "hello.com",
							public_key: "hello-world",
							created_at: "2024-02-01T15:41:57.542Z",
						},
					] as CustomerImageRegistry[])
				);
			})
		);

		await runWrangler("cloudchamber whoami --json");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(
			`"{\\"error\\":\\"INTERNAL_ERROR\\"}"`
		);
	});
});
