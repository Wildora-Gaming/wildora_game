# Wildora

MMO 2D de captura de criaturas com mundo e criaturas originais.
Cliente em **Phaser 3 + TypeScript (Vite)**, servidor autoritativo em **Colyseus 0.16 (Node)**.

## Jogar

Requisitos: Node 20+. Não precisa instalar banco de dados.

```bash
npm install
npm run dev        # desenvolvimento: abre em http://localhost:5173
```

Para jogar com amigos ou deixar rodando, use o modo de produção, que compila o jogo e serve
página e servidor no mesmo endereço:

```bash
npm start          # http://localhost:2567 (na rede local: http://SEU-IP:2567)
```

O progresso fica em `server/data/wildora.json` (fora do git). Para usar outro arquivo:
`DATA_FILE=/caminho/save.json npm start`. A porta muda com `PORT=8080`.

### Controles

| Tecla | Ação |
| --- | --- |
| Setas / WASD | andar (andar contra algo vira o personagem para ele) |
| E ou Espaço | interagir: placas, poço, Centro de Cura, Loja |
| T | time e caixa |
| B | mochila |
| Enter | chat |
| Esc | fechar painel / voltar no menu de batalha |

Andar contra a porta do Centro de Cura (telhado vermelho) ou da Loja (telhado azul) já entra.

## O que tem no jogo

- **Conta com senha** e progresso salvo: posição, time, caixa, mochila, Sementes e Criaturopédia.
- **Criador de personagem** com prévia ao vivo: pele, 7 cabelos, 4 olhos, 4 roupas, 3 partes de
  baixo, 3 chapéus e paletas de cor. Os outros jogadores veem o seu visual.
- **3 iniciais** (Leafin, Flambo, Aquari) e **25 criaturas**, com evoluções nos níveis 16/32 e 18/36.
- **Mundo 96×96** com a Vila Broto, 4 zonas de grama alta com criaturas e níveis próprios
  (Campina Norte, Campos do Leste, Pradaria Sul, Orla do Bosque), Lago Espelho e bosque.
- **Batalha por turnos** decidida no servidor: 8 tipos, mesmo tipo ×1,5, críticos, precisão,
  prioridade, 5 estados, fuga, troca de criatura, itens e troca forçada quando alguém desmaia.
- **Captura com Orbi** (Orbi, Orbi Prata, Orbi Ouro), chance maior com Vida baixa e estados.
- **XP dividido** entre quem lutou, subida de nível, golpes novos e **evolução**.
- **Time de até 6** e caixa ilimitada; ordem do time e líder configuráveis.
- **8 ginásios** (um de cada tipo) no Distrito dos Ginásios, ao sul da vila: em cada um você
  enfrenta 2 treinadores e o líder em sequência, sem curar no meio. Vencer o líder dá a insígnia
  e itens; treinadores trocam de criatura e escolhem golpes com estratégia.
- **Centro de Cura**, **Loja** (Orbis e Poções) e **Sementes** ganhas em batalha.
- **Ciclo dia/noite** (20 min, 6 de noite): à noite aparecem Shado e Batto.
- Multiplayer em tempo real com chat; quem está em batalha mostra um "!".
- Derrota: volta ao Centro de Cura com o time recuperado e perde 10% das Sementes.

## Comandos

```bash
npm test          # motor de batalha (19 testes) + ponta a ponta com clientes reais (19 testes)
npm run typecheck # tipos do servidor e do cliente
npm run build     # compila o cliente em client/dist
```

Para testar a noite sem esperar: `WILDORA_TIME_OFFSET=<ms> npm run dev` adianta o relógio do jogo.

## Arte

- **Criaturas:** pixel art de verdade, desenhada pixel a pixel pelo jogo a partir de
  `client/src/creatures/pixels.json`, sempre em escala inteira (sem borrão). O JSON é gerado por
  `tools/creatures/pixelize.py`, usando a folha de arte só como referência de forma e cor
  (detalhes em `tools/creatures/LEIA-ME.md`).
- **Personagem:** pixel art 16x24 montada por camadas. Os moldes ficam em `tools/avatar/parts.py`;
  depois de editar, rode `python3 tools/avatar/parts.py` para gerar `shared/avatar/parts.json` e
  `python3 tools/avatar/preview.py previa.png` para ver o resultado.
- **Mundo e itens:** desenhados por código em `client/src/world/art.ts` e `client/src/items-art.ts`.

## Estrutura

```
shared/                    regras compartilhadas (cliente e servidor importam daqui)
  constants.ts             regras gerais, dia/noite e formatos de mensagem
  map.ts                   mapa com a Vila Broto, objetos, colisão e busca de caminho
  creatures.ts             zonas e criaturas selvagens
  items.ts                 itens, loja e recompensas
  gyms.ts                  ginásios: treinadores, líderes, times e prêmios
  avatar/look.ts           opções e cores do personagem, validação
  avatar/compose.ts        monta os pixels do personagem a partir dos moldes
  battle/types.ts          8 tipos e tabela de efetividade
  battle/data.ts           golpes e espécies (atributos, golpes por nível, evolução)
  battle/engine.ts         motor de batalha puro: dano, ordem, estados, itens, captura, XP
  battle/text.ts           frases dos eventos de batalha
server/
  src/index.ts             sobe o servidor (e serve o jogo compilado)
  src/store.ts             contas e progresso em arquivo JSON (senha com scrypt)
  src/rooms/WorldRoom.ts   sala do mundo: contas, movimento, batalha, vila, time, chat
  src/schema/WorldState.ts estado sincronizado (jogadores visíveis, noite)
  test/                    testes do motor e de ponta a ponta
client/
  src/creator/             tela inicial, criação de personagem e escolha do inicial
  src/scenes/WorldScene.ts mundo, jogadores animados, entrada
  src/battle/BattleUI.ts   tela de batalha (só anima o que o servidor manda)
  src/panels/              time, caixa, mochila, loja e diálogos
  src/world/art.ts         tileset e objetos em pixel art
  src/avatar/sheet.ts      folha de sprites do personagem para o Phaser
tools/avatar/              moldes do personagem e prévia
tools/creatures/           gerador da pixel art das criaturas (referências + script)
```

## Decisões de arquitetura

- **Servidor é a autoridade.** O cliente só envia intenções (`move`, `battle_action`, `buy`...).
  Movimento, encontros, dano, sorteios, captura, XP, compras e mochila são validados no
  servidor; o resto é ignorado.
- **Movimento com previsão no cliente.** O seu personagem anda no mesmo quadro em que a tecla é
  apertada; cada passo leva um número (`seq`) e o servidor confirma ou corrige. O servidor limita
  a velocidade com um balde de passos (aceita pequenas rajadas da rede). Os outros jogadores
  andam por uma fila de tiles em velocidade constante, sem trancos.
- **Motor de batalha puro** (`shared/battle/engine.ts`): sem rede e com RNG injetado, testado
  isoladamente. O PvE roda dentro da sala do mundo; o PvP vai usar o mesmo motor numa sala própria.
- **Salvamento em arquivo** com escrita atômica: zero instalação. A interface `Store` é pequena
  para trocar por Postgres quando houver muitos jogadores.
- **Estado público × privado.** O `WorldState` só carrega o que os outros veem (nome, posição,
  aparência, se está em batalha, noite). Time, mochila e batalha vão por mensagem direta.

## Próximos passos sugeridos

- Trocas entre jogadores e batalha PvP (sala própria usando o mesmo motor)
- Segundo bioma e mapas feitos no Tiled
- Sons e música
- Postgres quando o número de jogadores crescer
