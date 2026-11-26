import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_API_VERSION } from '../server/version.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestedBackendPort = Number(process.env.PORT || 3001);
let backendPort = requestedBackendPort;
const frontendPort = process.env.VITE_PORT || '5173';
let healthUrl = `http://127.0.0.1:${backendPort}/api/health`;
const children = [];
let stopping = false;

function startProcess(label, args, environment = process.env) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  child.label = label;
  child.on('error', (error) => {
    console.error(`[dev] Não foi possível iniciar ${label}:`, error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[dev] ${label} encerrou (${signal ?? `código ${code}`}).`);
    stop(code || 1);
  });
  children.push(child);
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

async function waitForBackend(backend) {
  const deadline = Date.now() + 15000;
  let lastError;

  while (Date.now() < deadline) {
    if (backend.exitCode !== null) {
      throw new Error('O backend encerrou durante a inicialização.');
    }

    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const health = await response.json();
        if (
          health.status === 'ok'
          && health.service === 'retro-fps-server'
          && health.apiVersion === SERVER_API_VERSION
        ) return;
      }
      lastError = new Error(`Health check respondeu HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Backend não ficou disponível em ${healthUrl}.`, {
    cause: lastError,
  });
}

async function isBackendReady() {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return false;
    const health = await response.json();
    return health.status === 'ok'
      && health.service === 'retro-fps-server'
      && health.apiVersion === SERVER_API_VERSION;
  } catch {
    return false;
  }
}

function findAvailablePort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, () => {
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

try {
  if (await isBackendReady()) {
    console.log(`[dev] Backend já ativo em ${healthUrl}; usando a instância existente.`);
  } else {
    if (process.env.PORT) {
      throw new Error(
        `A porta ${requestedBackendPort} não contém o backend esperado (API ${SERVER_API_VERSION}). `
        + 'Defina PORT para uma porta livre ou encerre o serviço incompatível.',
      );
    }

    try {
      backendPort = await findAvailablePort(requestedBackendPort);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      for (let candidate = requestedBackendPort + 1; candidate <= 65535; candidate += 1) {
        try {
          backendPort = await findAvailablePort(candidate);
          console.warn(
            `[dev] A porta ${requestedBackendPort} está ocupada por uma instância incompatível; `
            + `usando ${backendPort} sem encerrar o processo existente.`,
          );
          break;
        } catch (candidateError) {
          if (candidateError.code !== 'EADDRINUSE') throw candidateError;
        }
      }
      if (backendPort === requestedBackendPort) {
        throw new Error('Não foi encontrada uma porta livre para o backend.');
      }
    }

    healthUrl = `http://127.0.0.1:${backendPort}/api/health`;
    const backend = startProcess('backend', ['server/index.js'], {
      ...process.env,
      PORT: String(backendPort),
    });
    await waitForBackend(backend);
  }
  if (stopping) process.exit(0);

  console.log('[dev] Backend pronto; iniciando Vite.');
  startProcess('frontend', [
    'node_modules/vite/bin/vite.js',
    '--host',
    '0.0.0.0',
    '--port',
    frontendPort,
  ], {
    ...process.env,
    PORT: String(backendPort),
  });
} catch (error) {
  console.error('[dev] Falha ao iniciar o ambiente de desenvolvimento:', error);
  stop(1);
}
