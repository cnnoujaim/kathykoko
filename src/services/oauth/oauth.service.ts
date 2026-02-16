import { google } from 'googleapis';
import { config } from '../../config';
import { oauthTokenRepository } from '../../repositories/oauth-token.repository';
import { pool } from '../../config/database';

/**
 * OAuth service for Google authentication
 * Handles OAuth flow, token management, and auto-refresh
 */
export class OAuthService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * Generate OAuth authorization URL for user consent
   * State parameter carries account_id for callback matching
   */
  generateAuthUrl(accountId: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: config.google.scopes,
      state: accountId, // Pass account ID to callback
      prompt: 'consent', // Force consent to ensure refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   * Encrypts and stores tokens in database
   */
  async exchangeCodeForTokens(code: string, accountId: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Missing access_token or refresh_token from Google');
      }

      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

      await oauthTokenRepository.upsert({
        account_id: accountId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes: tokens.scope?.split(' ') || config.google.scopes,
      });

      console.log(`✓ OAuth tokens saved for account ${accountId}`);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  /**
   * Get authenticated OAuth2 client for API calls
   * Handles token refresh automatically
   */
  async getAuthenticatedClient(accountId: string) {
    const tokens = await oauthTokenRepository.getDecryptedTokens(accountId);
    if (!tokens) {
      throw new Error(`No OAuth tokens found for account ${accountId}`);
    }

    this.oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expires_at?.getTime(),
    });

    // Auto-refresh handling - update DB when tokens refresh
    this.oauth2Client.on('tokens', async (newTokens) => {
      console.log(`🔄 Tokens refreshed for account ${accountId}`);

      if (newTokens.access_token) {
        const expiresAt = newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined;

        await oauthTokenRepository.upsert({
          account_id: accountId,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || tokens.refresh_token,
          expires_at: expiresAt,
        });
      }
    });

    return this.oauth2Client;
  }

  /**
   * Exchange code for tokens AND auto-create account
   * Used for simple onboarding flow
   */
  async exchangeCodeAndCreateAccount(code: string): Promise<{ accountId: string; email: string }> {
    try {
      // Get tokens from Google
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Missing access_token or refresh_token from Google');
      }

      // Get user info to find their email
      this.oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const email = userInfo.data.email;
      if (!email) {
        throw new Error('Failed to get email from Google');
      }

      // Find or create account
      let accountId: string;
      const existingAccount = await pool.query(
        'SELECT id FROM user_accounts WHERE email = $1',
        [email]
      );

      if (existingAccount.rows.length > 0) {
        // Account exists - use it
        accountId = existingAccount.rows[0].id;
        console.log(`✓ Found existing account for ${email}`);
      } else {
        // Create new account
        const accountType = this.inferAccountType(email);
        const isPrimary = !await this.hasPrimaryAccount();

        const newAccount = await pool.query(
          `INSERT INTO user_accounts (account_type, email, display_name, is_primary)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [accountType, email, email.split('@')[0], isPrimary]
        );

        accountId = newAccount.rows[0].id;
        console.log(`✓ Created new ${accountType} account for ${email} (${accountId})`);
      }

      // Store tokens
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

      await oauthTokenRepository.upsert({
        account_id: accountId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes: tokens.scope?.split(' ') || config.google.scopes,
      });

      console.log(`✓ OAuth tokens saved for ${email}`);

      return { accountId, email };
    } catch (error) {
      console.error('Error in exchangeCodeAndCreateAccount:', error);
      throw error;
    }
  }

  /**
   * Infer account type from email domain
   */
  private inferAccountType(email: string): 'personal' | 'music' | 'lyra' {
    const domain = email.split('@')[1].toLowerCase();

    // Check for work/lyra domains
    if (domain.includes('lyra') || domain.includes('work')) {
      return 'lyra';
    }

    // Check for music/artist domains
    if (
      email.toLowerCase().includes('persephone') ||
      email.toLowerCase().includes('music') ||
      email.toLowerCase().includes('artist')
    ) {
      return 'music';
    }

    // Default to personal
    return 'personal';
  }

  /**
   * Check if there's already a primary account
   */
  private async hasPrimaryAccount(): Promise<boolean> {
    const result = await pool.query('SELECT id FROM user_accounts WHERE is_primary = true');
    return result.rows.length > 0;
  }

  /**
   * Revoke access and delete tokens
   */
  async disconnect(accountId: string): Promise<void> {
    try {
      const tokens = await oauthTokenRepository.getDecryptedTokens(accountId);
      if (tokens) {
        await this.oauth2Client.revokeToken(tokens.access_token);
      }
    } catch (error) {
      console.error('Error revoking token:', error);
    } finally {
      await oauthTokenRepository.delete(accountId);
      console.log(`✓ OAuth disconnected for account ${accountId}`);
    }
  }
}

export const oauthService = new OAuthService();
