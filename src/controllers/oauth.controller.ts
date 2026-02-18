import { Request, Response } from 'express';
import { oauthService } from '../services/oauth/oauth.service';
import { OAuthCallbackParams } from '../types/oauth.types';
import { authController } from './auth.controller';

/**
 * OAuth controller for Google authentication flow
 * Handles authorization initiation, callback, and disconnection
 */
export class OAuthController {
  /**
   * Simple onboarding - connect any Google account
   * GET /oauth/connect
   */
  async connect(req: Request, res: Response): Promise<void> {
    try {
      // Use magic state to indicate auto-account creation
      const authUrl = oauthService.generateAuthUrl('auto-create');
      res.redirect(authUrl);
    } catch (error) {
      console.error('OAuth connect error:', error);
      res.status(500).json({ error: 'Failed to start OAuth flow' });
    }
  }

  /**
   * Initiate OAuth flow for a specific account (advanced/manual)
   * GET /oauth/authorize?account_id=<uuid>
   */
  async authorize(req: Request, res: Response): Promise<void> {
    try {
      const { account_id } = req.query;

      if (!account_id || typeof account_id !== 'string') {
        res.status(400).json({ error: 'Missing account_id parameter' });
        return;
      }

      const authUrl = oauthService.generateAuthUrl(account_id);
      res.redirect(authUrl);
    } catch (error) {
      console.error('OAuth authorize error:', error);
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  }

  /**
   * Handle OAuth callback from Google
   * GET /oauth/callback?code=...&state=<account_id or "auto-create">
   */
  async callback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state, error } = req.query as Partial<OAuthCallbackParams>;

      if (error) {
        console.error('OAuth error from Google:', error);
        res.send(`<h1>Authorization Failed</h1><p>${error}</p>`);
        return;
      }

      if (!code || !state) {
        res.status(400).send('<h1>Missing authorization code or state</h1>');
        return;
      }

      // Delegate login/connect flows to the auth controller
      if (state === 'login' || state.startsWith('connect:')) {
        return authController.callback(req, res);
      }

      let accountId: string;
      let userEmail: string | undefined;

      // Check if this is auto-create flow
      if (state === 'auto-create') {
        // Get user info from Google to find/create account
        const result = await oauthService.exchangeCodeAndCreateAccount(code);
        accountId = result.accountId;
        userEmail = result.email;
      } else {
        // Manual flow with existing account_id
        accountId = state;
        await oauthService.exchangeCodeForTokens(code, accountId);
      }

      res.send(`
        <h1>✓ Authorization Successful!</h1>
        ${userEmail ? `<p>Connected: <strong>${userEmail}</strong></p>` : ''}
        <p>Account ID: <code>${accountId}</code></p>
        <p style="color: #666; margin-top: 20px;">
          ${state === 'auto-create' ? 'Your account has been created and calendar is now syncing!' : 'Google Calendar is now connected!'}
        </p>
        <p style="margin-top: 30px;">You can close this window.</p>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).send(`<h1>Failed to complete authorization</h1><p>${error}</p>`);
    }
  }

  /**
   * Disconnect OAuth for an account
   * DELETE /oauth/disconnect/:account_id
   */
  async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const { account_id } = req.params;

      await oauthService.disconnect(account_id);

      res.json({ message: 'OAuth disconnected successfully' });
    } catch (error) {
      console.error('OAuth disconnect error:', error);
      res.status(500).json({ error: 'Failed to disconnect OAuth' });
    }
  }
}

export const oauthController = new OAuthController();
