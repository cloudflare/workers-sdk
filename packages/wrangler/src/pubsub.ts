import { fetchResult } from "./cfetch";

/**
 * Namespace schema
 */
export interface Namespace {
  id: string;
  name: string;
  description?: string;
  created_on?: string;
  modified_on?: string;
}

export interface OnPublish {
  url: string;
}

/**
 * Namespace schema
 */
export interface Broker {
  id: string;
  name: string;
  description?: string;
  expiration?: number;
  created_on?: string;
  modified_on?: string;
  on_publish?: OnPublish;
}

/**
 * Values in udpateBroker
 */
export interface BrokerUpdate {
  description?: string;
  expiration?: number;
  on_publish?: OnPublish;
}

/**
 * Fetch a list of namespaces in account
 */
export async function listNamespaces(
  accountId: string
): Promise<Namespace[]> {
  return await fetchResult<Namespace[]>(`/accounts/${accountId}/pubsub/namespaces`);
}

/**
 * Create a namespace
 */
//DELETE: https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pubsub/namespaces


export async function createPubSubNamespace(
  accountId: string,
  namespace: Namespace,
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces`,
    { method: "POST",
      body: JSON.stringify(namespace)
    }
  );
}

/**
 * Delete a namespace with the given name
 */
export async function deleteNamespace(
  accountId: string,
  namespace: string
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}`,
    { method: "DELETE" }
  );
}

/**
 * Fetch a list of brokers in namespace
 */
export async function listBrokers(
  accountId: string,
  namespace: string,
): Promise<Broker[]> {
  return await fetchResult<Broker[]>(`/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers`);
}

/**
 * Create a namespace
 */
export async function createBroker(
  accountId: string,
  namespace: string,
  broker: Broker,
): Promise<void> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers`,
    { method: "POST",
      body: JSON.stringify(broker)
    }
  );
}

/**
 * Create a namespace
 */
export async function updateBroker(
  accountId: string,
  namespace: string,
  broker: string,
  update: BrokerUpdate,
): Promise<void> {
  console.log('update', JSON.stringify(update))
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers/${broker}`,
    { method: "PATCH",
      body: JSON.stringify(update)
    }
  );
}

/**
 * Get the public keys for a broker for JWT verifications
 */
export async function getPublicKeys(
  accountId: string,
  namespace: string,
  broker: string,
): Promise<any> {
  return await fetchResult<any>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers/${broker}/publickeys`
  );
}

/**
 * Issue additional tokens for a broker
 */
export async function issueTokens(
  accountId: string,
  namespace: string,
  broker: string,
  number: number
): Promise<Record<string,string>> {
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers/${broker}/credentials?number=${number}`
  );
}

/**
 * Revoke access for a set of tokens
 */
export async function revokeTokens(
  accountId: string,
  namespace: string,
  broker: string,
  ...jti: string[]
): Promise<void> {
  const q = new URLSearchParams()
  jti.forEach(id => q.append('jti', id))
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers/${broker}/revocations?${q.toString()}`,
    { methods: "POST", bodyy:'' }
  );
}

/**
 * Unrevoke access for a set of tokens
 */
export async function unrevokeTokens(
  accountId: string,
  namespace: string,
  broker: string,
  ...jti: string[]
): Promise<void> {
  const q = new URLSearchParams()
  jti.forEach(id => q.append('jti', id))
  return await fetchResult<void>(
    `/accounts/${accountId}/pubsub/namespaces/${namespace}/brokers/${broker}/revocations?${q.toString()}`,
    { method: "DELETE" }
  );
}

/**
 * Lookup broker by host
 */
export async function lookupBroker(host: string): [namespace: string, broker: string] {
  // Note: if we support custom broker hostnames later, this will need to be smarter
  const [broker, namespace, ...rest] = host.split('.')
  if (rest[0] != 'cloudflarepubsub' || rest[1] != 'com') {
    throw new CommandLineArgsError(
      `${args.broker} is not a valid Broker host`
    )
  }
  return [namespace, broker]
}

