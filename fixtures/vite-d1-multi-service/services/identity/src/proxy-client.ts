export class ProxyD1 {
  constructor(private baseURL: string) {}

  prepare(sql: string) {
    const self = this;

    return {
      async all(params: any[] = []) {
        const res = await fetch(`${self.baseURL}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, params }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data.result;
      },

      async first(params: any[] = []) {
        const res = await fetch(`${self.baseURL}/query-first`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, params }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data.result;
      }
    };
  }
}
