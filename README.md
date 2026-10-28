# Wildora

MMO 2D de captura de criaturas com mundo e criaturas originais.
Cliente em **Phaser 3 + TypeScript (Vite)**, servidor autoritativo em **Colyseus 0.16 (Node)**.

## Rodando

Requisitos: Node 20+.

```bash
npm install
npm run dev
```

- Cliente: http://localhost:5173
- Servidor: ws://localhost:2567

Escolha um nome e a criatura inicial (Leafin, Flambo ou Aquari). Ande com **setas/WASD**;
**Enter** abre o chat. Na grama alta existe chance de encontrar uma criatura selvagem, o que
abre a tela de batalha: **Lutar** mostra os golpes, **Fugir** tenta escapar, **Esc** volta do
menu de golpes.

Outros comandos:

```bash
npm test          # motor de batalha (unitário) + 2 clientes reais contra o servidor
npm run typecheck # checagem de tipos do servidor e do cliente
npm run build     # build de produção do cliente (client/dist)
```

Para apontar o cliente para outro servidor: `VITE_SERVER_URL=wss://seu-servidor npm run build`.

## Sprites das criaturas

Coloque PNGs em `client/public/sprites/` com o id da espécie (`leafin.png`, e opcionalmente
`leafin_back.png` para a vista de costas). Sem arquivo, aparece uma forma provisória na cor do
tipo. Detalhes em `client/public/sprites/LEIA-ME.md`.

## Estrutura

```
shared/                    regras compartilhadas (cliente e servidor importam daqui)
  constants.ts             cooldowns, chance de encontro, formatos de mensagem
  map.ts                   mapa "Campina Inicial" e colisão
  creatures.ts             criaturas selvagens por zona e chances
  battle/types.ts          8 tipos e tabela de efetividade
  battle/data.ts           golpes e espécies (atributos, golpes por nível)
  battle/engine.ts         motor de batalha puro: dano, ordem, estados, fuga, XP
  battle/text.ts           frases dos eventos de batalha
server/
  src/index.ts             sobe o servidor Colyseus
  src/rooms/WorldRoom.ts   sala do mundo: entrada, movimento, chat, encontros e batalha PvE
  src/schema/WorldState.ts estado sincronizado (jogadores visíveis)
  test/engine.ts           testes do motor de batalha
  test/smoke.ts            teste de ponta a ponta com 2 clientes
client/
  index.html               login (nome + inicial), HUD e chat
  src/main.ts              login e criação do jogo
  src/network.ts           conexão com o servidor
  src/scenes/WorldScene.ts mapa, jogadores, entrada
  src/battle/BattleUI.ts   tela de batalha (só anima o que o servidor manda)
  src/creature-art.ts      sprite da criatura ou forma provisória
```

## Decisões de arquitetura

- **Servidor é a autoridade.** O cliente só envia intenção (`move: "up"`,
  `battle_action: { kind: "move", moveIndex: 0 }`). Movimento, encontros, dano, sorteios e XP
  são calculados no servidor; ações inválidas são ignoradas.
- **Motor de batalha puro** em `shared/battle/engine.ts`: sem rede e com RNG injetado, o que
  permite testar cada regra isoladamente. O PvE roda dentro da sala do mundo; o PvP (fase 4)
  vai usar o mesmo motor numa sala própria.
- **Movimento em grade** (tile a tile, 32px). Simplifica colisão, sincronização e anti-cheat.
- **Estado público × privado.** O `WorldState` só carrega o que os outros precisam ver (nome,
  posição, direção, se está em batalha). Time e batalha vão por mensagem direta.

## O que já funciona

- Login com nome e criatura inicial
- Vários jogadores no mesmo mapa, em tempo real, com chat
- Encontros na grama alta com Pawly, Chirpy, Rocky e Zappi (Shado só à noite, quando houver ciclo)
- Batalha PvE por turnos: tipos, mesmo tipo ×1,5, críticos, precisão, prioridade, 5 estados,
  fuga, XP, subida de nível e golpes novos
- Quem está em batalha aparece com um "!" para os outros jogadores
- Derrota: o time é recuperado e o jogador volta para a trilha central

## Ainda não

- Contas e banco de dados: o time é perdido ao sair (fase 2)
- Captura com Orbi, mochila e troca de criatura (fase 3)
- Ciclo dia/noite
