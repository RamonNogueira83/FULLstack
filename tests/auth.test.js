import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createApp } from '../server/app.js';
import { SERVER_API_VERSION } from '../server/version.js';

async function startTestServer(app) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('player registration, login timestamps, private sessions, and logout', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'retro-fps-auth-'));
  const databasePath = path.join(directory, 'players.sqlite');
  const frontendDistPath = path.join(directory, 'dist');
  await mkdir(path.join(frontendDistPath, 'assets'), { recursive: true });
  await writeFile(path.join(frontendDistPath, 'index.html'), '<main>Retro FPS test app</main>');
  await writeFile(path.join(frontendDistPath, 'assets', 'app.js'), 'console.log("test");');
  const { app, close } = createApp({
    databasePath,
    secureCookies: true,
    serveFrontend: true,
    frontendDistPath,
  });
  const server = await startTestServer(app);

  try {
    const frontend = await fetch(server.baseUrl);
    assert.equal(frontend.status, 200);
    assert.match(await frontend.text(), /Retro FPS test app/);

    const frontendAsset = await fetch(`${server.baseUrl}/assets/app.js`);
    assert.equal(frontendAsset.status, 200);
    assert.equal(await frontendAsset.text(), 'console.log("test");');

    const frontendRoute = await fetch(`${server.baseUrl}/lobby/room-123`);
    assert.equal(frontendRoute.status, 200);
    assert.match(await frontendRoute.text(), /Retro FPS test app/);

    const unknownApi = await fetch(`${server.baseUrl}/api/unknown`);
    assert.equal(unknownApi.status, 404);

    const health = await fetch(`${server.baseUrl}/api/health`);
    assert.deepEqual(await health.json(), {
      status: 'ok',
      service: 'retro-fps-server',
      apiVersion: SERVER_API_VERSION,
    });

    const unauthenticatedProfile = await fetch(`${server.baseUrl}/api/auth/me`);
    assert.equal(unauthenticatedProfile.status, 401);

    const malformedJson = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"nickname":',
    });
    assert.equal(malformedJson.status, 400);

    const invalidRegistration = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: 'x',
        email: 'not-an-email',
        password: 'short',
      }),
    });
    assert.equal(invalidRegistration.status, 400);

    const registration = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: 'ArenaPilot',
        email: 'Pilot@example.com',
        password: 'correct horse battery',
      }),
    });
    assert.equal(registration.status, 201);
    const registrationBody = await registration.json();
    assert.deepEqual(Object.keys(registrationBody.player).sort(), [
      'createdAt',
      'email',
      'id',
      'lastLoginAt',
      'nickname',
    ]);
    assert.equal(registrationBody.player.nickname, 'ArenaPilot');
    assert.equal(registrationBody.player.email, 'pilot@example.com');
    assert.equal(registrationBody.player.lastLoginAt, null);
    assert.ok(Number.isFinite(Date.parse(registrationBody.player.createdAt)));

    const duplicateRegistration = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: 'AnotherPilot',
        email: 'PILOT@example.com',
        password: 'correct horse battery',
      }),
    });
    assert.equal(duplicateRegistration.status, 409);

    const wrongPassword = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'ArenaPilot',
        password: 'wrong password',
      }),
    });
    assert.equal(wrongPassword.status, 401);

    const login = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'PILOT@EXAMPLE.COM',
        password: 'correct horse battery',
      }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.ok(Number.isFinite(Date.parse(loginBody.player.lastLoginAt)));
    assert.equal(JSON.stringify(loginBody).includes('password'), false);

    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie?.includes('HttpOnly'));
    assert.ok(cookie?.includes('SameSite=Lax'));
    assert.ok(cookie?.includes('Secure'));
    const sessionToken = cookie.match(/retro_fps_session=([^;]+)/)?.[1];
    assert.ok(sessionToken);

    const profile = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: `retro_fps_session=${sessionToken}` },
    });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).player.nickname, 'ArenaPilot');

    const database = new Database(databasePath, { readonly: true });
    try {
      const savedPlayer = database.prepare(`
        SELECT nickname, email, password_hash, created_at, last_login_at
        FROM players
        WHERE id = ?
      `).get(registrationBody.player.id);
      assert.equal(savedPlayer.nickname, 'ArenaPilot');
      assert.equal(savedPlayer.email, 'pilot@example.com');
      assert.match(savedPlayer.password_hash, /^scrypt\$32768\$8\$1\$/);
      assert.notEqual(savedPlayer.password_hash, 'correct horse battery');
      assert.ok(Number.isFinite(Date.parse(savedPlayer.last_login_at)));

      const savedSession = database.prepare(`
        SELECT token_hash
        FROM player_sessions
        WHERE player_id = ?
      `).get(registrationBody.player.id);
      assert.ok(savedSession.token_hash);
      assert.notEqual(savedSession.token_hash, sessionToken);
    } finally {
      database.close();
    }

    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: `retro_fps_session=${sessionToken}` },
    });
    assert.equal(logout.status, 204);
    assert.ok(logout.headers.get('set-cookie')?.includes('Max-Age=0'));

    const profileAfterLogout = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: `retro_fps_session=${sessionToken}` },
    });
    assert.equal(profileAfterLogout.status, 401);
  } finally {
    await server.close();
    close();
    await rm(directory, { recursive: true, force: true });
  }
});
