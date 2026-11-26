# Retro FPS

FPS multiplayer para navegador com estética retrô, desenvolvido em JavaScript.
O projeto está sendo implementado por etapas; as etapas concluídas preparam a
estrutura frontend/backend e apresentam a primeira arena 3D.

## Arquitetura

- `src/`: aplicação frontend servida pelo Vite.
- `server/`: servidor Node.js com Express.
- `data/players.sqlite`: banco SQLite persistente criado automaticamente pelo servidor.
- `index.html`, `src/main.js` e `src/style.css`: frontend e prévia da arena.
- `vite.config.js`: configuração do Vite e proxy `/api` para o backend.

Three.js renderiza a arena low-poly com uma textura de piso em baixa resolução
e renderização pixelada em resolução reduzida, com tone mapping e sombras
suavizadas para aumentar contraste e profundidade sem perder o estilo retrô.
A câmera FPS oferece mouse (Pointer Lock), A/D para
esquerda/direita, W/S para frente/trás, corrida com Shift e pulo com Espaço.
O mapa tático original tem contêineres industriais, coberturas, divisórias,
marcação de setores, vigas, iluminação e sinalização. Um rifle low-poly aparece
em primeira pessoa e acompanha o movimento. Clique esquerdo dispara usando
raycast local contra a geometria do mapa, com clarão, recuo, impacto, áudio e
traçante. O impacto é validado no centro da mira; o traçante visual parte da
boca do cano e termina nesse mesmo ponto, compensando a perspectiva da arma.
O rifle tem carregador de 30 disparos, reserva de 90 e recarga com R.
Em salas multiplayer, Rapier também simula o movimento no servidor. O servidor
valida munição e cadência, traça os disparos contra a geometria e adversários,
aplica dano, eliminações e respawn. O cliente recebe estados periódicos e
interpola os jogadores remotos. Rapier controla as colisões com piso, paredes,
contêineres, coberturas, caixas, pilares e plataforma.

## Contas de jogador

O backend cria o banco SQLite automaticamente em `data/players.sqlite`. O
caminho pode ser alterado com a variável de ambiente `DATABASE_PATH`. O banco
guarda nick único, email único (normalizado sem diferenciar maiúsculas),
hash de senha scrypt com salt aleatório, data de criação e último login.
Senhas e hashes nunca são devolvidos pela API. Sessões usam tokens aleatórios
armazenados somente como hash e cookie `HttpOnly`, `SameSite=Lax`; em produção,
o cookie também exige HTTPS (`Secure`).

Endpoints iniciais:

- `POST /api/auth/register` — JSON `{ "nickname", "email", "password" }`.
- `POST /api/auth/login` — JSON `{ "identifier", "password" }`; aceita nick ou email.
- `GET /api/auth/me` — retorna o jogador da sessão atual.
- `POST /api/auth/logout` — encerra e invalida a sessão.

Nicks aceitam 3–20 letras ASCII, números ou `_`. Senhas devem ter 12–128
caracteres. No registro, `lastLoginAt` fica nulo até o primeiro login
bem-sucedido. Em hospedagens online, use armazenamento persistente para o
arquivo SQLite ou migre para PostgreSQL se houver múltiplas instâncias do
servidor.

## Login, salas e times

Ao abrir o jogo, o jogador pode entrar com uma conta existente, criar uma
conta ou escolher um nick de visitante. Depois da identificação, a tela
**Salas online** permite criar sala aberta ou protegida por senha, ou entrar
em uma sala disponível. Senhas de sala existem somente na memória do servidor
e são verificadas usando hash com salt; as salas desaparecem quando ficam
vazias ou quando o servidor reinicia.

O lobby usa Socket.IO para atualizar a lista e os times em tempo real. Cada
sala comporta até 6 conexões, divididas entre **Internacional (vermelho)** e
**Grêmio (azul)**, com no máximo 3 jogadores por time. O servidor valida
senha, lotação e trocas de time. A opção **Entrar na arena (teste)** abre a
partida da sala: posição, orientação, vida, munição, disparos, dano,
eliminações e respawn são sincronizados pelo Socket.IO. O servidor é a
autoridade do movimento e combate; tiros em aliados não causam dano.
O lobby também oferece três skins low-poly originais — mensageiro cyberpunk,
piloto pulp espacial e explorador pós-apocalíptico. A seleção é validada pelo
servidor, e o modelo remoto usa as mesmas dimensões verticais dos hitboxes de
cabeça e corpo para que mirar no personagem corresponda ao dano calculado.
O placar exibe eliminações/mortes e cada jogador reaparece após 2,5 segundos.
Ao criar uma sala, escolha a meta coletiva de 20, 30 ou 50 eliminações. A
primeira equipe a alcançar a meta vence; a pontuação das equipes aparece no
HUD e na lista de salas. A partida encerra os controles, mostra o placar final
e não aceita novos disparos. As salas e o estado da partida existem na memória
do processo, portanto são reiniciados quando o servidor reinicia.

## Instalação e execução passo a passo

### 1. Instale o Node.js

Instale uma versão LTS compatível: **Node.js 20.19 ou superior da linha 20**,
ou **Node.js 22.12 ou superior**. O npm é instalado junto com o Node.js.

Confirme a instalação em um terminal:

```bash
node --version
npm --version
```

### 2. Abra a pasta do projeto

Baixe/extraia o projeto e abra a pasta `FULLstack` no VS Code. No VS Code, abra
**Terminal → Novo Terminal**. Confirme que o terminal está na pasta que contém
`package.json`; se necessário, navegue até ela:

```powershell
cd C:\caminho\para\FULLstack
```

### 3. Instale as dependências

Execute uma vez na pasta do projeto:

```bash
npm install
```

Isso instala Three.js, Rapier, Vite, Express, Socket.IO e as demais dependências.
Não é necessário instalar ou configurar SQLite à parte: o backend cria
automaticamente `data/players.sqlite` na primeira inicialização.

### 4. Inicie o jogo

Inicie o frontend e o backend juntos:

```bash
npm run dev
```

Mantenha esse terminal aberto enquanto estiver usando o jogo. O Vite mostrará
o endereço local — normalmente `http://localhost:5173`; abra-o no Chrome ou
Firefox.

O comando verifica a versão da API antes de reutilizar um backend existente.
Se a porta padrão do backend (3001) estiver ocupada por uma versão antiga ou
outro serviço, ele inicia a versão atual em outra porta livre e configura o
proxy do Vite automaticamente, sem encerrar o processo que já estava rodando.
Se a porta padrão do frontend (5173) estiver ocupada, o Vite escolherá outra e
mostrará o endereço correto no terminal.

### 5. Entre em uma partida

1. Faça login, crie uma conta ou escolha **Entrar como visitante**.
2. Crie uma sala ou entre em uma sala disponível.
3. Escolha um time e clique em **Entrar na arena (teste)**.
4. Controles: **W/A/S/D** para mover, mouse para olhar, botão esquerdo para
   disparar, **R** para recarregar, **Espaço** para pular, **Shift** para correr
   e **Esc** para liberar o mouse.

Para verificar que o backend está respondendo, abra `/api/health` no mesmo
endereço do Vite, por exemplo `http://localhost:5173/api/health`.

### Comandos úteis

```bash
npm run dev       # frontend e backend juntos
npm test          # testes automatizados
npm run build     # build de produção do frontend
```

Para executar frontend e backend em terminais separados, use `npm run dev:client`
e `npm run dev:server`. O frontend usa `PORT` para localizar o backend
(padrão: 3001). No modo combinado, `PORT` seleciona a porta preferida do
backend e `VITE_PORT` seleciona a porta preferida do Vite.

## Deploy no Render

O repositório inclui [render.yaml](./render.yaml) para publicar o frontend e o
backend juntos como um único serviço Node.js. O Express serve os arquivos
gerados pelo Vite e o mesmo servidor atende a API e o Socket.IO. O servidor usa
a porta `PORT` fornecida pelo Render e escuta em `0.0.0.0`.

1. Envie o projeto para um repositório GitHub.
2. No Render, escolha **New → Blueprint** e conecte esse repositório.
3. Revise o serviço `retro-fps` detectado pelo `render.yaml` e confirme o deploy.
4. Quando o deploy terminar, abra o endereço `.onrender.com` exibido no painel.
   O health check `/api/health` deve informar `status: "ok"`.

O Blueprint executa `npm ci && npm run build` e inicia o servidor com
`npm start`. Os requisitos de versão do Node estão declarados em `package.json`.
Se preferir criar um Web Service manualmente, use os mesmos comandos de build e
start e configure `NODE_ENV=production`.

**Limitações importantes do plano gratuito:** o serviço pode suspender após
inatividade e levar algum tempo para responder novamente. O SQLite fica no
sistema de arquivos efêmero do serviço; contas e sessões podem ser perdidas
quando o serviço reinicia, suspende ou recebe um novo deploy. As salas e
partidas também são mantidas somente na memória e reiniciam junto com o
servidor. Use este deploy para demonstração/testes, não como armazenamento
permanente de contas. Antes de abrir o jogo ao público ou armazenar dados reais,
migre as contas para um banco persistente e planeje como manter salas e estado
multiplayer disponíveis durante reinícios.

### Solução de problemas

- **`node` ou `npm` não é reconhecido:** instale/atualize o Node.js e abra um
  novo terminal do VS Code.
- **Falha ao instalar dependências:** confirme a conexão com a internet e rode
  `npm install` novamente na pasta que contém `package.json`.
- **Porta ocupada:** no modo combinado, o projeto tenta selecionar uma porta
  livre automaticamente. Confira no terminal o endereço que o Vite exibiu.
- **A página não conecta ao servidor:** mantenha o terminal do `npm run dev`
  aberto e recarregue a página. O health check `/api/health` deve retornar
  `status: "ok"` e a versão da API.
- **O mouse não captura:** clique na arena para tentar novamente. Se o navegador
  bloquear Pointer Lock, mova o mouse sobre a arena para olhar e use **Esc**
  para pausar.

## Verificação de build

```bash
npm run build
```

Os testes de movimento, colisões, munição e recarga podem ser executados com:

```bash
npm test
```

A suíte também cobre fluxo multiplayer com dois clientes conectados,
movimentação autoritativa, headshot, dano, eliminação e respawn.
