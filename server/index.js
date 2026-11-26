import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { attachRoomHandlers } from './rooms.js';

const port = Number(process.env.PORT) || 3001;
const { app, close, resolveSession } = createApp();
const server = createServer(app);
const io = new Server(server);
const rooms = attachRoomHandlers(io, { resolveSession });

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `A porta ${port} já está em uso. O backend não iniciou; ` +
      `encerre o serviço que a ocupa ou execute com PORT definido para outra porta.`,
    );
  } else {
    console.error('Falha ao iniciar o servidor HTTP:', error);
  }
  rooms.close();
  close();
  process.exitCode = 1;
});

server.listen(port, () => {
  console.log(`Servidor HTTP disponível em http://localhost:${port}`);
});

function shutdown() {
  io.close(() => {
    rooms.close();
    close();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
