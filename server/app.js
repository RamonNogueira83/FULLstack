import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayerStore } from './playerStore.js';
import { SERVER_API_VERSION } from './version.js';
import { hashPassword, verifyPassword } from './passwords.js';

const SESSION_COOKIE = 'retro_fps_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NICKNAME_LENGTH = 20;
const MIN_NICKNAME_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 12;
const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../data/players.sqlite', import.meta.url));
const DEFAULT_FRONTEND_DIST_PATH = fileURLToPath(new URL('../dist/', import.meta.url));

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const prefix = `${name}=`;

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }

  return undefined;
}

function serializeSessionCookie(token, { secure, maxAge }) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    parts.push('Secure');
  }
  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }

  return parts.join('; ');
}

function publicPlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    email: player.email,
    createdAt: player.created_at,
    lastLoginAt: player.last_login_at,
  };
}

function validateRegistration(body) {
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (
    nickname.length < MIN_NICKNAME_LENGTH
    || nickname.length > MAX_NICKNAME_LENGTH
    || !/^[a-zA-Z0-9_]+$/.test(nickname)
  ) {
    return {
      error: `O nick deve ter entre ${MIN_NICKNAME_LENGTH} e ${MAX_NICKNAME_LENGTH} caracteres: letras, números ou _.`,
    };
  }

  if (
    email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { error: 'Informe um email válido.' };
  }

  if (
    password.length < MIN_PASSWORD_LENGTH
    || password.length > MAX_PASSWORD_LENGTH
    || Buffer.byteLength(password, 'utf8') > 1024
  ) {
    return {
      error: `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }

  return { nickname, email, password };
}

export function createApp({
  databasePath = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
  secureCookies = process.env.NODE_ENV === 'production',
  serveFrontend = process.env.NODE_ENV === 'production',
  frontendDistPath = DEFAULT_FRONTEND_DIST_PATH,
} = {}) {
  const store = createPlayerStore(path.resolve(databasePath));
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb', type: 'application/json' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'retro-fps-server',
      apiVersion: SERVER_API_VERSION,
    });
  });

  app.post('/api/auth/register', async (request, response) => {
    const registration = validateRegistration(request.body ?? {});
    if (registration.error) {
      response.status(400).json({ error: registration.error });
      return;
    }

    const passwordHash = await hashPassword(registration.password);
    let playerId;
    try {
      playerId = store.createPlayer({
        nickname: registration.nickname,
        email: registration.email,
        passwordHash,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        response.status(409).json({ error: 'Nick ou email já está cadastrado.' });
        return;
      }
      throw error;
    }

    response.status(201).json({ player: publicPlayer(store.findPlayerById(playerId)) });
  });

  app.post('/api/auth/login', async (request, response) => {
    const identifier = typeof request.body?.identifier === 'string'
      ? request.body.identifier.trim()
      : '';
    const password = typeof request.body?.password === 'string'
      ? request.body.password
      : '';

    if (identifier.length === 0 || identifier.length > 254 || password.length > MAX_PASSWORD_LENGTH) {
      response.status(400).json({ error: 'Nick/email e senha são obrigatórios.' });
      return;
    }

    const player = store.findPlayerByIdentifier(identifier);
    const isValidPassword = await verifyPassword(password, player?.password_hash);
    if (!player || !isValidPassword) {
      response.status(401).json({ error: 'Nick/email ou senha inválidos.' });
      return;
    }

    const now = Date.now();
    store.deleteExpiredSessions(now);
    const token = randomBytes(32).toString('base64url');
    const lastLoginAt = new Date(now).toISOString();
    store.updateLastLogin(player.id, lastLoginAt);
    store.createSession({
      tokenHash: hashToken(token),
      playerId: player.id,
      createdAt: lastLoginAt,
      expiresAt: now + SESSION_DURATION_MS,
    });

    response.setHeader('Set-Cookie', serializeSessionCookie(token, {
      secure: secureCookies,
      maxAge: SESSION_DURATION_MS / 1000,
    }));
    response.json({
      player: publicPlayer({ ...player, last_login_at: lastLoginAt }),
    });
  });

  app.get('/api/auth/me', (request, response) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) {
      response.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }

    const player = store.findSession(hashToken(token), Date.now());
    if (!player) {
      response.setHeader('Set-Cookie', serializeSessionCookie('', {
        secure: secureCookies,
        maxAge: 0,
      }));
      response.status(401).json({ error: 'Sessão inválida ou expirada.' });
      return;
    }

    response.json({ player: publicPlayer(player) });
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
      store.deleteSession(hashToken(token));
    }
    response.setHeader('Set-Cookie', serializeSessionCookie('', {
      secure: secureCookies,
      maxAge: 0,
    }));
    response.status(204).end();
  });

  if (serveFrontend) {
    app.use(express.static(frontendDistPath, { index: false }));
    app.get(/.*/, (request, response, next) => {
      if (
        request.path === '/api'
        || request.path.startsWith('/api/')
        || request.path === '/socket.io'
        || request.path.startsWith('/socket.io/')
        || path.extname(request.path)
        || !request.accepts('html')
      ) {
        next();
        return;
      }

      response.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((error, _request, response, _next) => {
    if (response.headersSent) {
      console.error('Erro após o envio da resposta da API:', error);
      return;
    }
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'JSON inválido.' });
      return;
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: 'Corpo da requisição excede o limite.' });
      return;
    }
    console.error('Erro não tratado na API:', error);
    response.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return {
    app,
    resolveSession(cookieHeader) {
      const token = readCookie({ headers: { cookie: cookieHeader } }, SESSION_COOKIE);
      if (!token) return null;
      return store.findSession(hashToken(token), Date.now());
    },
    close() {
      store.close();
    },
  };
}
