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

Crie seu personagem (pele, cabelo, olhos, roupas, cores e chapéu), escolha a criatura inicial
(Leafin, Flambo ou Aquari) e entre na Vila Broto. Ande com **setas/WASD**;
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

## Arte

- **Criaturas:** PNGs em `client/public/sprites/`, recortados da folha de referência. Para trocar,
  substitua o arquivo com o mesmo nome (detalhes em `client/public/sprites/LEIA-ME.md`).
- **Personagem:** pixel art 16x24 montada por camadas. Os moldes ficam em `tools/avatar/parts.py`;
  depois de editar, rode `python3 tools/avatar/parts.py` para gerar `shared/avatar/parts.json` e
  `python3 tools/avatar/preview.py previa.png` para ver o resultado.
- **Mundo:** tileset desenhado por código em `client/src/world/art.ts` (16 px por tile, câmera com zoom 3).

## Estrutura

```
shared/                    regras compartilhadas (cliente e servidor importam daqui)
  constants.ts             cooldowns, chance de encontro, formatos de mensagem
  map.ts                   mapa (96x72) com a Vila Broto, objetos, colisão e busca de caminho
  avatar/look.ts           opções e cores do personagem, validação
  avatar/compose.ts        monta os pixels do personagem a partir dos moldes
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
  index.html               HUD e chat
  src/creator/             criador de personagem e escolha do inicial
  src/main.ts              login e criação do jogo
  src/network.ts           conexão com o servidor
  src/scenes/WorldScene.ts mundo, jogadores animados, entrada
  src/world/art.ts         tileset e objetos em pixel art
  src/avatar/sheet.ts      folha de sprites do personagem para o Phaser
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
- **Movimento em grade** (tile a tile, 16 px). Simplifica colisão, sincronização e anti-cheat.
- **Estado público × privado.** O `WorldState` só carrega o que os outros precisam ver (nome,
  posição, direção, se está em batalha). Time e batalha vão por mensagem direta.

## O que já funciona

- Criador de personagem com prévia ao vivo (7 cabelos, 4 olhos, 4 roupas, 3 partes de baixo,
  3 chapéus e paletas de cor); o visual é salvo no navegador e visto pelos outros jogadores
- Escolha da criatura inicial
- Mapa grande com vila, estradas, campinas, lago, bosque e zona de pedras
- Vários jogadores no mesmo mapa, em tempo real, com chat
- Encontros na grama alta com Pawly, Chirpy, Rocky e Zappi (Shado só à noite, quando houver ciclo)
- Batalha PvE por turnos: tipos, mesmo tipo ×1,5, críticos, precisão, prioridade, 5 estados,
  fuga, XP, subida de nível e golpes novos
- Quem está em batalha aparece com um "!" para os outros jogadores
- Derrota: o time é recuperado e o jogador volta para a vila

## Ainda não

- Contas e banco de dados: o time é perdido ao sair (fase 2)
- Captura com Orbi, mochila e troca de criatura (fase 3)
- Ciclo dia/noite
