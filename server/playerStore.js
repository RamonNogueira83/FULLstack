import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function createPlayerStore(filename) {
  mkdirSync(path.dirname(filename), { recursive: true });

  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS player_sessions (
      token_hash TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_player_sessions_expiry
      ON player_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_player_sessions_player
      ON player_sessions(player_id);
  `);

  const statements = {
    createPlayer: database.prepare(`
      INSERT INTO players (nickname, email, password_hash, created_at, last_login_at)
      VALUES (@nickname, @email, @passwordHash, @createdAt, NULL)
    `),
    findPlayerByIdentifier: database.prepare(`
      SELECT id, nickname, email, password_hash, created_at, last_login_at
      FROM players
      WHERE nickname = @identifier COLLATE NOCASE
        OR email = @identifier COLLATE NOCASE
      LIMIT 1
    `),
    findPlayerById: database.prepare(`
      SELECT id, nickname, email, created_at, last_login_at
      FROM players
      WHERE id = ?
    `),
    updateLastLogin: database.prepare(`
      UPDATE players
      SET last_login_at = ?
      WHERE id = ?
    `),
    createSession: database.prepare(`
      INSERT INTO player_sessions (token_hash, player_id, created_at, expires_at)
      VALUES (@tokenHash, @playerId, @createdAt, @expiresAt)
    `),
    findSession: database.prepare(`
      SELECT players.id, players.nickname, players.email,
             players.created_at, players.last_login_at
      FROM player_sessions
      JOIN players ON players.id = player_sessions.player_id
      WHERE player_sessions.token_hash = @tokenHash
        AND player_sessions.expires_at > @now
    `),
    deleteSession: database.prepare(`
      DELETE FROM player_sessions
      WHERE token_hash = ?
    `),
    deleteExpiredSessions: database.prepare(`
      DELETE FROM player_sessions
      WHERE expires_at <= ?
    `),
  };

  return {
    createPlayer(player) {
      const result = statements.createPlayer.run(player);
      return result.lastInsertRowid;
    },
    findPlayerByIdentifier(identifier) {
      return statements.findPlayerByIdentifier.get({ identifier });
    },
    findPlayerById(id) {
      return statements.findPlayerById.get(id);
    },
    updateLastLogin(id, timestamp) {
      statements.updateLastLogin.run(timestamp, id);
    },
    createSession(session) {
      statements.createSession.run(session);
    },
    findSession(tokenHash, now) {
      return statements.findSession.get({ tokenHash, now });
    },
    deleteSession(tokenHash) {
      statements.deleteSession.run(tokenHash);
    },
    deleteExpiredSessions(now) {
      statements.deleteExpiredSessions.run(now);
    },
    close() {
      database.close();
    },
  };
}
