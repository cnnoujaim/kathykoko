import crypto from 'crypto';
import { config } from '../config';

interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Encryption utility for OAuth tokens using AES-256-GCM
 * Provides authenticated encryption with built-in integrity checks
 */
export class EncryptionUtil {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    // Derive 32-byte key from ENCRYPTION_KEY env var
    const salt = 'kathykoko-salt'; // Static salt for consistent key derivation
    this.key = crypto.scryptSync(config.encryptionKey, salt, 32);
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * Returns encrypted data with IV and auth tag for verification
   */
  encrypt(plaintext: string): EncryptedData {
    // Generate random IV (16 bytes for GCM)
    const iv = crypto.randomBytes(16);

    // Create cipher (cast to any for GCM-specific methods)
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as any;

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag (GCM mode provides this for integrity)
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt encrypted data using AES-256-GCM
   * Verifies integrity using auth tag before returning plaintext
   */
  decrypt(data: EncryptedData): string {
    // Create decipher (cast to any for GCM-specific methods)
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(data.iv, 'hex')
    ) as any;

    // Set auth tag for verification
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    // Decrypt (will throw if auth tag doesn't match)
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export const encryptionUtil = new EncryptionUtil();
