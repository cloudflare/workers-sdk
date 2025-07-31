import { DurableObject } from 'cloudflare:workers'

export class UnsafeBindingObject extends DurableObject {
    async get(tag: string) {
        return await this.ctx.storage.get<number>(tag);
    }

    async set(key: string, value: number) {
        await this.ctx.storage.put<number>(key, value);
    }
}
