import { WorkerEntrypoint } from "cloudflare:workers";
import type { UnsafeBindingObject } from "./object.worker";

// ENV configuration
interface Env {
    config: { emitLogs: boolean };
    store: DurableObjectNamespace<UnsafeBindingObject>;
}

/**
 * UnsafeBinding offers two RPCs, `performUnsafeWrite` and `performUnsafeRead`.
 */
export class UnsafeBindingServiceEntrypoint extends WorkerEntrypoint<Env> {
    override async fetch(_request: Request): Promise<Response> {
        return new Response('This is a development stub for an unsafe worker.', {
            status: 200,
            statusText: 'OK',
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    async performUnsafeWrite(key: string, value: number) {
        if (this.env.config.emitLogs) {
            console.log("Emitting a log for write operation")
        }
        const objectNamespace = this.env.store;
        const namespaceId = JSON.stringify(this.env.config);
        const id = objectNamespace.idFromName(namespaceId);
        const stub = objectNamespace.get(id);
        await stub.set(key, value);

        return {
            ok: true,
            result: `Set key ${key} to ${value}`,
            meta: {
                workersVersion: "my-version-from-dev"
            },
        };
    }

    async performUnsafeRead(key: string) {
        if (this.env.config.emitLogs) {
            console.log("Emitting a log for read operation")
        }
        const objectNamespace = this.env.store;
        const namespaceId = JSON.stringify(this.env.config);
        const id = objectNamespace.idFromName(namespaceId);
        const stub = objectNamespace.get(id);
        const value = await stub.get(key);

        return {
            ok: true,
            result: value,
            meta: {
                workersVersion: "my-version-from-dev"
            },
        };
    }
}
