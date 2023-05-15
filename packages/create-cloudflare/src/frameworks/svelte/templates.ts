export const platformInterface = `
interface Platform {
  env: {
    COUNTER: DurableObjectNamespace;
  };
  context: {
    waitUntil(promise: Promise<any>): void;
  };
  caches: CacheStorage & { default: Cache }
}
`;

// interface["Platform"] #context #waitUntil:nth(2)
