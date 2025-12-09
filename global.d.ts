/* eslint-disable */

// Vercel compatible environment interface
interface Env {
  // Google OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  
  // Security
  COOKIE_ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  
  // Server config
  HOSTED_DOMAIN?: string;
  VERCEL_URL?: string;
  
  // Multi-platform tracking (optional)
  META_ACCESS_TOKEN?: string;
  META_PIXEL_ID?: string;
  META_AD_ACCOUNT_ID?: string;
  
  TIKTOK_ACCESS_TOKEN?: string;
  TIKTOK_PIXEL_CODE?: string;
  TIKTOK_ADVERTISER_ID?: string;
  
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  GA4_PROPERTY_ID?: string;
  
  STAPE_API_KEY?: string;
  STAPE_ORGANIZATION_ID?: string;
}

// Extend process.env with our Env interface
declare global {
  namespace NodeJS {
    interface ProcessEnv extends Env {}
  }
}

export {};
