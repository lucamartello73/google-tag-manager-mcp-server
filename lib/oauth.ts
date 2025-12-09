/**
 * OAuth Provider for Vercel - Custom Google OAuth implementation
 */

import { randomBytes, createHash, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';
import {
  storage,
  storeOAuthClient,
  getOAuthClient,
  deleteOAuthClient,
  storeOAuthToken,
  getOAuthToken,
  storeOAuthGrant,
  listUserGrants,
  revokeGrant,
  storeOAuthState,
  getOAuthState,
} from './storage';

const scryptAsync = promisify(scrypt);

// Types
export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  responseType: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export interface TokenRequest {
  grantType: string;
  code?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

export interface UserProps {
  userId: string;
  name: string;
  email: string;
  accessToken: string;
  clientId: string;
}

// Generate secure random strings
export function generateCode(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

export function generateClientId(): string {
  return `gtm_${generateCode(16)}`;
}

export function generateClientSecret(): string {
  return generateCode(32);
}

// Encryption helpers
async function getEncryptionKey(secret: string): Promise<Buffer> {
  return (await scryptAsync(secret, 'salt', 32)) as Buffer;
}

export async function encryptData(data: string, secret: string): Promise<string> {
  const key = await getEncryptionKey(secret);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export async function decryptData(encryptedData: string, secret: string): Promise<string> {
  const [ivHex, encrypted] = encryptedData.split(':');
  const key = await getEncryptionKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Client registration
export async function registerClient(params: {
  redirectUris: string[];
  name: string;
}): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  
  await storeOAuthClient({
    clientId,
    clientSecret,
    redirectUris: params.redirectUris,
    name: params.name,
    createdAt: Date.now(),
  });
  
  return { clientId, clientSecret };
}

export async function lookupClient(clientId: string) {
  return getOAuthClient(clientId);
}

// Authorization flow
export async function parseAuthRequest(url: URL): Promise<AuthRequest> {
  return {
    clientId: url.searchParams.get('client_id') || '',
    redirectUri: url.searchParams.get('redirect_uri') || '',
    scope: (url.searchParams.get('scope') || '').split(' ').filter(Boolean),
    state: url.searchParams.get('state') || undefined,
    responseType: url.searchParams.get('response_type') || 'code',
    codeChallenge: url.searchParams.get('code_challenge') || undefined,
    codeChallengeMethod: url.searchParams.get('code_challenge_method') || undefined,
  };
}

export async function createAuthorizationCode(
  authRequest: AuthRequest,
  userId: string,
  props: UserProps,
): Promise<string> {
  const code = generateCode(32);
  
  await storeOAuthState(code, {
    authRequest,
    userId,
    props,
    createdAt: Date.now(),
  }, 300); // 5 minute expiry
  
  return code;
}

export async function completeAuthorization(params: {
  request: AuthRequest;
  userId: string;
  metadata?: { label: string };
  scope: string[];
  props: UserProps;
}): Promise<{ redirectTo: string }> {
  const code = await createAuthorizationCode(params.request, params.userId, params.props);
  
  // Store grant
  const grantId = generateCode(16);
  await storeOAuthGrant({
    id: grantId,
    userId: params.userId,
    clientId: params.request.clientId,
    scope: params.scope,
    createdAt: Date.now(),
  });
  
  const redirectUrl = new URL(params.request.redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (params.request.state) {
    redirectUrl.searchParams.set('state', params.request.state);
  }
  
  return { redirectTo: redirectUrl.toString() };
}

// Token exchange
export async function exchangeCode(code: string, clientId: string): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
  props: UserProps;
} | null> {
  const stateData = await getOAuthState(code);
  
  if (!stateData || (stateData.authRequest as AuthRequest).clientId !== clientId) {
    return null;
  }
  
  const accessToken = generateCode(32);
  const expiresIn = 3600; // 1 hour
  
  await storeOAuthToken({
    accessToken,
    userId: (stateData.props as UserProps).userId,
    clientId,
    scope: (stateData.authRequest as AuthRequest).scope,
    expiresAt: Date.now() + (expiresIn * 1000),
    props: stateData.props as Record<string, unknown>,
  });
  
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn,
    scope: (stateData.authRequest as AuthRequest).scope.join(' '),
    props: stateData.props as UserProps,
  };
}

// Token validation
export async function validateToken(accessToken: string): Promise<UserProps | null> {
  const token = await getOAuthToken(accessToken);
  
  if (!token || token.expiresAt < Date.now()) {
    return null;
  }
  
  return token.props as UserProps;
}

// User grant management
export { listUserGrants, revokeGrant, deleteOAuthClient };

// Google OAuth helpers
export function getUpstreamAuthorizeUrl(params: {
  upstreamUrl: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  state: string;
  hostedDomain?: string;
}): string {
  const url = new URL(params.upstreamUrl);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  
  if (params.hostedDomain) {
    url.searchParams.set('hd', params.hostedDomain);
  }
  
  return url.toString();
}

export async function fetchUpstreamAuthToken(params: {
  upstreamUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  grantType: string;
}): Promise<[string | null, Response | null]> {
  const response = await fetch(params.upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: params.grantType,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return [null, new Response(`Failed to exchange code: ${errorText}`, { status: 400 })];
  }
  
  const data = await response.json() as { access_token: string };
  return [data.access_token, null];
}
