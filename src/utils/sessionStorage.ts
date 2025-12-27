import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Session data structure for storage
 */
export interface StoredSession {
  /** Session identifier */
  id: string;
  /** Session data */
  data: Record<string, any>;
  /** Expiration timestamp */
  expiresAt: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Session storage manager
 * Handles persistent storage of session data to avoid re-authentication
 */
export class SessionStorage {
  private readonly storageDir: string;

  constructor(storageDir?: string) {
    // Default to .sessions directory in project root
    this.storageDir = storageDir || path.join(__dirname, '../../.sessions');
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir);
    } catch {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a session
   */
  private getSessionPath(sessionId: string): string {
    // Sanitize session ID to prevent directory traversal
    const sanitized = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storageDir, `${sanitized}.json`);
  }

  /**
   * Save a session to storage
   * @param sessionId - Unique identifier for the session
   * @param data - Session data to store
   * @param ttl - Time to live in milliseconds (default: 24 hours)
   */
  async saveSession(
    sessionId: string,
    data: Record<string, any>,
    ttl: number = 24 * 60 * 60 * 1000
  ): Promise<void> {
    await this.ensureStorageDir();

    const session: StoredSession = {
      id: sessionId,
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl
    };

    const sessionPath = this.getSessionPath(sessionId);
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');

    console.log(`💾 Session saved: ${sessionId} (expires in ${Math.round(ttl / 1000 / 60)} minutes)`);
  }

  /**
   * Load a session from storage
   * @param sessionId - Unique identifier for the session
   * @returns Session data if valid, null if expired or not found
   */
  async loadSession(sessionId: string): Promise<Record<string, any> | null> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      const content = await fs.readFile(sessionPath, 'utf-8');
      const session: StoredSession = JSON.parse(content);

      // Check if session has expired
      if (Date.now() > session.expiresAt) {
        console.log(`⏱️  Session expired: ${sessionId}`);
        await this.deleteSession(sessionId);
        return null;
      }

      const remainingTime = Math.round((session.expiresAt - Date.now()) / 1000 / 60);
      console.log(`✓ Session loaded: ${sessionId} (${remainingTime} minutes remaining)`);
      return session.data;

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Session file doesn't exist
        return null;
      }
      console.error(`Error loading session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Delete a session from storage
   * @param sessionId - Unique identifier for the session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      await fs.unlink(sessionPath);
      console.log(`🗑️  Session deleted: ${sessionId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Error deleting session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Check if a session exists and is valid
   * @param sessionId - Unique identifier for the session
   * @returns True if session exists and hasn't expired
   */
  async hasValidSession(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    return session !== null;
  }

  /**
   * Clean up all expired sessions
   * @returns Number of sessions cleaned up
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);
      let cleanedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.storageDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const session: StoredSession = JSON.parse(content);

          if (Date.now() > session.expiresAt) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          console.error(`Error processing session file ${file}:`, error);
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired session(s)`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      return 0;
    }
  }

  /**
   * Get all active session IDs
   * @returns Array of session IDs
   */
  async getActiveSessions(): Promise<string[]> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);
      const sessions: string[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.storageDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const session: StoredSession = JSON.parse(content);

          if (Date.now() <= session.expiresAt) {
            sessions.push(session.id);
          }
        } catch (error) {
          console.error(`Error reading session file ${file}:`, error);
        }
      }

      return sessions;
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }
}

/**
 * Create a singleton session storage instance
 */
export function createSessionStorage(storageDir?: string): SessionStorage {
  return new SessionStorage(storageDir);
}
