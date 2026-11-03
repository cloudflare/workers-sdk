import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import {
	createProgram,
	getPreEmitDiagnostics,
	flattenDiagnosticMessageText,
	ScriptTarget,
	ModuleKind,
	ModuleResolutionKind,
} from "typescript";
import { it } from "vitest";
import { getIdentityBindingType } from "../type-generation/identity";

const require = createRequire(import.meta.url);
const runtime =
	require.resolve("@cloudflare/workers-types/experimental/index.d.ts");
runInTempDir();

it("typechecks generated workload, app and customer capabilities and pending facts", ({
	expect,
}) => {
	const policy = {
		binding: "SAVED",
		connector_id: "a7e6a4e4-6666-4666-8666-123456789abc",
		connector_revision: 1,
		scope: ["read"],
		resources: [
			{ url: "https://api.example/items", methods: ["GET" as const] },
		],
	};
	const workload = getIdentityBindingType({ binding: "WORKLOAD" });
	const customer = getIdentityBindingType({ ...policy, selection: "customer" });
	const manage = getIdentityBindingType({
		...policy,
		selection: "customer",
		connection_management: true,
	});
	const app = getIdentityBindingType({
		...policy,
		selection: "app",
		connection_management: true,
	});
	writeFileSync(
		"api.ts",
		`export {};
 declare const workload: ${workload};
 declare const customer: ${customer};
 declare const manage: ${manage};
 declare const app: ${app};
 const agent = await workload.getIdentity({agentId:'agent-a'});
 const token: string = await agent.getToken();
 const grant: string = await agent.getAuthorizationGrant({authorizationServer:'https://as.example'});
 const saved = await customer.getIdentity({agentId:'agent-a',customerId:'tenant',connectionId:'saved'});
 const id: Promise<string> = saved.id;
 const connection: Promise<string | null> = saved.connectionId;
 const status = await saved.getStatus();
 await saved.fetch('https://api.example/items');
 const completion = {sessionId:'session',flowId:'flow',receipt:'receipt'};
 const pending = await manage.previewConnection('tenant',completion);
 const subject: string | undefined = pending.authorization.subject;
 const issuer: string | undefined = pending.authorization.issuer;
 const scope: 'token_response' | 'requested' | 'unknown' = pending.authorization.scopeSource;
 await manage.beginConnection('tenant',{sessionId:'session',returnTo:'https://app.example/complete'});
 await manage.completeConnection('tenant',completion);
 await app.getIdentity('agent-a');
 await app.getIdentity({agentId:'agent-a',connectionId:'saved'});
 await app.previewConnection(completion);
 await app.disconnectAll();
 // @ts-expect-error Customer selection must name the customer.
 await customer.getIdentity('tenant');
 // @ts-expect-error Use-only attachments cannot manage connections.
 await customer.beginConnection('tenant',{});
 // @ts-expect-error Saved handles do not export provider credentials.
 await saved.getToken();
 // @ts-expect-error Pending facts contain no provider credentials.
 void pending.authorization.accessToken;
 // @ts-expect-error App management does not accept a customer prefix.
 await app.previewConnection('tenant',completion);
 // @ts-expect-error Workload selection does not accept saved-authorization fields.
 await workload.getIdentity({customerId:'tenant'});
 void [token,grant,id,connection,status,subject,issuer,scope];
 `
	);
	const program = createProgram({
		rootNames: [resolve("api.ts"), runtime],
		options: {
			strict: true,
			noEmit: true,
			skipLibCheck: true,
			target: ScriptTarget.ESNext,
			module: ModuleKind.ESNext,
			moduleResolution: ModuleResolutionKind.Bundler,
			lib: ["lib.esnext.d.ts"],
			types: [],
		},
	});
	expect(
		getPreEmitDiagnostics(program).map((d) =>
			flattenDiagnosticMessageText(d.messageText, "\n")
		)
	).toEqual([]);
});
