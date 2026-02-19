import { Request, Response } from 'express';
import { google } from 'googleapis';
import { config } from '../config';
import { authService } from '../services/auth/auth.service';
import { oauthTokenRepository } from '../repositories/oauth-token.repository';
import { pool } from '../config/database';

class AuthController {
  private createOAuth2Client() {
    return new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  /**
   * GET /auth/google — Redirect to Google OAuth for login
   */
  async login(_req: Request, res: Response): Promise<void> {
    try {
      const client = this.createOAuth2Client();
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: config.google.scopes,
        state: 'login',
        prompt: 'consent',
      });
      res.redirect(authUrl);
    } catch (error) {
      console.error('Auth login error:', error);
      res.status(500).json({ error: 'Failed to start login' });
    }
  }

  /**
   * GET /auth/google/connect — Add another Google account (must be authenticated)
   */
  async connectAccount(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Must be logged in to connect accounts' });
        return;
      }

      const client = this.createOAuth2Client();
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: config.google.scopes,
        state: `connect:${req.user.userId}`,
        prompt: 'consent',
      });
      res.redirect(authUrl);
    } catch (error) {
      console.error('Auth connect error:', error);
      res.status(500).json({ error: 'Failed to start account connection' });
    }
  }

  /**
   * GET /auth/callback — Handle Google OAuth callback
   * State is either "login" or "connect:<userId>"
   */
  async callback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        res.redirect('/?error=auth_denied');
        return;
      }

      if (!code || !state) {
        res.status(400).send('Missing authorization code or state');
        return;
      }

      const client = this.createOAuth2Client();
      const { tokens } = await client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        res.redirect('/?error=missing_tokens');
        return;
      }

      // Get Google profile
      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email!;
      const name = userInfo.data.name || email.split('@')[0];
      const avatarUrl = userInfo.data.picture || null;

      if (state === 'login') {
        // Login flow: find or create user, then set JWT cookie
        const user = await authService.findOrCreateUser({ email, name, avatar_url: avatarUrl || undefined });

        // Find or create user_account linked to this user
        let accountId = await this.findOrCreateUserAccount(user.id, email, name);

        // Store OAuth tokens
        await oauthTokenRepository.upsert({
          account_id: accountId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          scopes: tokens.scope?.split(' ') || config.google.scopes,
        });

        // Set JWT cookie
        const jwtToken = authService.signToken(user.id, user.email);
        authService.setAuthCookie(res, jwtToken);

        console.log(`✓ User logged in: ${email}`);
        res.redirect('/');
      } else if (state.startsWith('connect:')) {
        // Connect flow: add account to existing user
        const userId = state.replace('connect:', '');

        let accountId = await this.findOrCreateUserAccount(userId, email, name);

        // Store OAuth tokens
        await oauthTokenRepository.upsert({
          account_id: accountId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          scopes: tokens.scope?.split(' ') || config.google.scopes,
        });

        console.log(`✓ Connected account ${email} to user ${userId}`);
        res.redirect('/?connected=true');
      } else {
        // Legacy flow: treat as auto-create (backwards compat with old /oauth/callback)
        const user = await authService.findOrCreateUser({ email, name, avatar_url: avatarUrl || undefined });
        let accountId = await this.findOrCreateUserAccount(user.id, email, name);

        await oauthTokenRepository.upsert({
          account_id: accountId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          scopes: tokens.scope?.split(' ') || config.google.scopes,
        });

        const jwtToken = authService.signToken(user.id, user.email);
        authService.setAuthCookie(res, jwtToken);
        res.redirect('/');
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      res.redirect('/?error=auth_failed');
    }
  }

  /**
   * POST /auth/logout — Clear JWT cookie
   */
  async logout(_req: Request, res: Response): Promise<void> {
    authService.clearAuthCookie(res);
    res.json({ success: true });
  }

  /**
   * GET /auth/me — Return current user info + categories
   */
  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    try {
      const user = await authService.findUserById(req.user.userId);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Get user's categories
      const categories = await pool.query(
        'SELECT id, name, color, is_default, sort_order FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
        [user.id]
      );

      // Get connected accounts (include phone_number if column exists)
      let accounts;
      try {
        accounts = await pool.query(
          `SELECT ua.id, ua.email, ua.account_type, ua.is_primary, ua.phone_number,
                  CASE WHEN ot.id IS NOT NULL THEN true ELSE false END as has_oauth
           FROM user_accounts ua
           LEFT JOIN oauth_tokens ot ON ua.id = ot.account_id
           WHERE ua.user_id = $1
           ORDER BY ua.is_primary DESC, ua.created_at ASC`,
          [user.id]
        );
      } catch {
        // phone_number column may not exist yet (pre-migration 014)
        accounts = await pool.query(
          `SELECT ua.id, ua.email, ua.account_type, ua.is_primary, NULL as phone_number,
                  CASE WHEN ot.id IS NOT NULL THEN true ELSE false END as has_oauth
           FROM user_accounts ua
           LEFT JOIN oauth_tokens ot ON ua.id = ot.account_id
           WHERE ua.user_id = $1
           ORDER BY ua.is_primary DESC, ua.created_at ASC`,
          [user.id]
        );
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
        },
        categories: categories.rows,
        accounts: accounts.rows,
      });
    } catch (error) {
      console.error('Auth me error:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  }

  /**
   * Helper: find or create a user_account linked to a user
   */
  private async findOrCreateUserAccount(userId: string, email: string, name: string): Promise<string> {
    const existing = await pool.query(
      'SELECT id FROM user_accounts WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      // Link to user if not already linked
      await pool.query(
        'UPDATE user_accounts SET user_id = $1 WHERE id = $2 AND user_id IS NULL',
        [userId, existing.rows[0].id]
      );
      return existing.rows[0].id;
    }

    // Create new account
    const accountType = this.inferAccountType(email);
    const hasPrimary = await pool.query(
      'SELECT id FROM user_accounts WHERE user_id = $1 AND is_primary = true',
      [userId]
    );
    const isPrimary = hasPrimary.rows.length === 0;

    const result = await pool.query(
      `INSERT INTO user_accounts (account_type, email, display_name, is_primary, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [accountType, email, name, isPrimary, userId]
    );

    return result.rows[0].id;
  }

  private inferAccountType(email: string): string {
    const lower = email.toLowerCase();
    const domain = lower.split('@')[1];

    if (domain?.includes('lyra') || domain?.includes('work')) return 'lyra';
    if (lower.includes('persephone') || lower.includes('music') || lower.includes('artist')) return 'music';
    return 'personal';
  }
}

export const authController = new AuthController();
