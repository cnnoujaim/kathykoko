import { pool } from '../config/database';
import { OAuthToken, CreateOAuthTokenInput, DecryptedTokens } from '../types/oauth.types';
import { encryptionUtil } from '../utils/encryption.util';

/**
 * Repository for OAuth token management with encryption
 * Tokens are encrypted at rest using AES-256-GCM
 */
export class OAuthTokenRepository {
  /**
   * Create or update OAuth token for an account
   * Encrypts tokens before storage
   */
  async upsert(input: CreateOAuthTokenInput): Promise<OAuthToken> {
    const {
      account_id,
      provider = 'google',
      access_token,
      refresh_token,
      token_type,
      expires_at,
      scopes = [],
    } = input;

    // Encrypt tokens
    const encryptedAccess = encryptionUtil.encrypt(access_token);
    const encryptedRefresh = encryptionUtil.encrypt(refresh_token);

    // Store encrypted data as JSON strings
    const accessJson = JSON.stringify(encryptedAccess);
    const refreshJson = JSON.stringify(encryptedRefresh);

    const result = await pool.query(
      `INSERT INTO oauth_tokens (
        account_id, provider, access_token_encrypted, refresh_token_encrypted,
        token_type, expires_at, scopes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (account_id, provider)
      DO UPDATE SET
        access_token_encrypted = $3,
        refresh_token_encrypted = $4,
        token_type = $5,
        expires_at = $6,
        scopes = $7,
        updated_at = NOW()
      RETURNING *`,
      [account_id, provider, accessJson, refreshJson, token_type, expires_at, scopes]
    );

    return result.rows[0];
  }

  /**
   * Find OAuth token by account ID
   */
  async findByAccountId(accountId: string, provider: string = 'google'): Promise<OAuthToken | null> {
    const result = await pool.query(
      'SELECT * FROM oauth_tokens WHERE account_id = $1 AND provider = $2',
      [accountId, provider]
    );
    return result.rows[0] || null;
  }

  /**
   * Decrypt and return tokens for API calls
   */
  async getDecryptedTokens(accountId: string): Promise<DecryptedTokens | null> {
    const token = await this.findByAccountId(accountId);
    if (!token) return null;

    try {
      const accessData = JSON.parse(token.access_token_encrypted);
      const refreshData = JSON.parse(token.refresh_token_encrypted);

      return {
        access_token: encryptionUtil.decrypt(accessData),
        refresh_token: encryptionUtil.decrypt(refreshData),
        expires_at: token.expires_at,
      };
    } catch (error) {
      console.error('Failed to decrypt OAuth tokens:', error);
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Check if token exists for account
   */
  async hasValidToken(accountId: string): Promise<boolean> {
    const token = await this.findByAccountId(accountId);
    return token !== null;
  }

  /**
   * Delete token (for logout/disconnect)
   */
  async delete(accountId: string, provider: string = 'google'): Promise<void> {
    await pool.query(
      'DELETE FROM oauth_tokens WHERE account_id = $1 AND provider = $2',
      [accountId, provider]
    );
  }
}

export const oauthTokenRepository = new OAuthTokenRepository();
