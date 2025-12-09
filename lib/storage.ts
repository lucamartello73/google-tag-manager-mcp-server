/**
 * Vercel KV Storage adapter
 * Uses in-memory storage for development, can be replaced with Vercel KV in production
 */

// In-memory store for development (replace with Vercel KV in production)
const memoryStore = new Map<string, { value: string; expiry?: number }>();

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

class MemoryStorage implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    const item = memoryStore.get(key);
    if (!item) return null;
    
    if (item.expiry && Date.now() > item.expiry) {
      memoryStore.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const item: { value: string; expiry?: number } = { value };
    if (ttl) {
      item.expiry = Date.now() + (ttl * 1000);
    }
    memoryStore.set(key, item);
  }

  async delete(key: string): Promise<void> {
    memoryStore.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of memoryStore.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

// OAuth client storage
interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  name: string;
  createdAt: number;
}

// OAuth token storage
interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  clientId: string;
  scope: string[];
  expiresAt: number;
  props: Record<string, unknown>;
}

// OAuth grant storage
interface OAuthGrant {
  id: string;
  userId: string;
  clientId: string;
  scope: string[];
  createdAt: number;
}

export const storage = new MemoryStorage();

// OAuth-specific storage functions
export async function storeOAuthClient(client: OAuthClient): Promise<void> {
  await storage.set(`oauth:client:${client.clientId}`, JSON.stringify(client));
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const data = await storage.get(`oauth:client:${clientId}`);
  return data ? JSON.parse(data) : null;
}

export async function deleteOAuthClient(clientId: string): Promise<void> {
  await storage.delete(`oauth:client:${clientId}`);
}

export async function storeOAuthToken(token: OAuthToken): Promise<void> {
  const ttl = Math.floor((token.expiresAt - Date.now()) / 1000);
  await storage.set(`oauth:token:${token.accessToken}`, JSON.stringify(token), ttl > 0 ? ttl : undefined);
  await storage.set(`oauth:user:${token.userId}:${token.clientId}`, JSON.stringify(token), ttl > 0 ? ttl : undefined);
}

export async function getOAuthToken(accessToken: string): Promise<OAuthToken | null> {
  const data = await storage.get(`oauth:token:${accessToken}`);
  return data ? JSON.parse(data) : null;
}

export async function storeOAuthGrant(grant: OAuthGrant): Promise<void> {
  await storage.set(`oauth:grant:${grant.id}`, JSON.stringify(grant));
  await storage.set(`oauth:user:${grant.userId}:grant:${grant.id}`, JSON.stringify(grant));
}

export async function getOAuthGrant(grantId: string): Promise<OAuthGrant | null> {
  const data = await storage.get(`oauth:grant:${grantId}`);
  return data ? JSON.parse(data) : null;
}

export async function listUserGrants(userId: string): Promise<OAuthGrant[]> {
  const keys = await storage.list(`oauth:user:${userId}:grant:`);
  const grants: OAuthGrant[] = [];
  
  for (const key of keys) {
    const data = await storage.get(key);
    if (data) {
      grants.push(JSON.parse(data));
    }
  }
  
  return grants;
}

export async function revokeGrant(grantId: string, userId: string): Promise<void> {
  await storage.delete(`oauth:grant:${grantId}`);
  await storage.delete(`oauth:user:${userId}:grant:${grantId}`);
}

// State storage for OAuth flow
export async function storeOAuthState(state: string, data: Record<string, unknown>, ttl: number = 600): Promise<void> {
  await storage.set(`oauth:state:${state}`, JSON.stringify(data), ttl);
}

export async function getOAuthState(state: string): Promise<Record<string, unknown> | null> {
  const data = await storage.get(`oauth:state:${state}`);
  if (data) {
    await storage.delete(`oauth:state:${state}`);
    return JSON.parse(data);
  }
  return null;
}
