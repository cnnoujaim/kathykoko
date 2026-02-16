/**
 * OAuth token record from database (encrypted)
 */
export interface OAuthToken {
  id: string;
  account_id: string;
  provider: 'google';
  access_token_encrypted: string; // JSON string: {encrypted, iv, authTag}
  refresh_token_encrypted: string; // JSON string: {encrypted, iv, authTag}
  token_type: string | null;
  expires_at: Date | null;
  scopes: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating/updating OAuth tokens
 * Tokens are provided in plaintext and will be encrypted before storage
 */
export interface CreateOAuthTokenInput {
  account_id: string;
  provider?: 'google';
  access_token: string; // Plaintext - will be encrypted
  refresh_token: string; // Plaintext - will be encrypted
  token_type?: string;
  expires_at?: Date;
  scopes?: string[];
}

/**
 * Decrypted tokens for API calls
 */
export interface DecryptedTokens {
  access_token: string;
  refresh_token: string;
  expires_at: Date | null;
}

/**
 * OAuth callback query parameters from Google
 */
export interface OAuthCallbackParams {
  code: string;
  state?: string; // account_id
  error?: string;
  error_description?: string;
}
