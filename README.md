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

Sem configurar nada, o login é local (nome de treinador + senha) e o progresso fica em
`server/data/wildora.json` (fora do git). Para usar outro arquivo: `DATA_FILE=/caminho/save.json npm start`.
A porta muda com `PORT=8080`.

### Online, com conta de e-mail

Com o Supabase configurado (`.env` ou variáveis do host, veja [`.env.example`](.env.example)), o jogo
passa a usar **conta por e-mail** (cadastro, confirmação por e-mail, esqueci a senha) e grava o
progresso em tabelas no Postgres: treinadores, criaturas (com quem capturou, onde, nível e XP),
mochila, dex e insígnias.

O passo a passo para colocar no ar (Supabase + Render agora; domínio próprio e Oracle depois) está em
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

### Controles

| Tecla | Ação |
| --- | --- |
| Setas / WASD | andar (andar contra algo vira o personagem para ele) |
| E ou Espaço | interagir: placas, poço, Centro de Cura, Loja; de frente para outro jogador abre batalha/troca |
| Clique em outro jogador | desafiar para batalha amistosa ou propor troca |
| T | time e caixa |
| B | mochila |
| Enter | chat |
| Esc | fechar painel / voltar no menu de batalha |

Andar contra a porta do Centro de Cura (telhado vermelho) ou da Loja (telhado azul) já entra.

**No celular** aparecem controles de toque: direcional à esquerda (arrastar o dedo muda a direção;
toque curto anda um passo), botão **A** para interagir e atalhos de Time, Mochila e Chat. Tocar em
outro jogador abre o menu de batalha e troca. Para ver os controles de toque no computador, abra
com `?toque=1` no endereço.

## O que tem no jogo

- **Conta por e-mail** (confirmação, esqueci a senha) e progresso salvo: posição, time, caixa,
  mochila, Sementes, Criaturopédia e insígnias. Cada criatura guarda quem a capturou e onde.
- **Criador de personagem** com prévia ao vivo: pele, 7 cabelos, 4 olhos, 4 roupas, 3 partes de
  baixo, 3 chapéus e paletas de cor. Os outros jogadores veem o seu visual.
- **Nível máximo 100** (lendários até 150).
- **3 iniciais** (Leafin, Flambo, Aquari) e **109 criaturas** em 43 linhas evolutivas, incluindo
  4 lendários. As criaturas do começo (Pawly, Zebri, Chirpy, Fluffi, Sprouty, Batto, Shado, Woolly,
  Baleo e Shroomy) evoluem nos níveis 16 e 32.
- **Mundo 256×192** com a Vila Broto no centro e 8 biomas grandes, com bordas irregulares que se
  misturam aos poucos: Campina Norte, Campos do Leste, Pradaria Sul e Orla do Bosque perto da vila
  (níveis 2 a 10), e mais longe Planície Gelada, Bosque Encantado, Encosta Vulcânica e Costa dos
  Recifes (a partir do nível 12). Quanto mais longe da vila, mais fortes e evoluídas as criaturas: no
  fundo dos biomas distantes chegam ao nível 70–80. O HUD mostra a faixa de nível de onde você está. Cada bioma tem chão, grama alta e vegetação próprios; estradas sinuosas
  ligam a vila aos ginásios. **Minimapa** no canto e **mapa grande** (tecla M, botão Mapa ou toque no
  minimapa) com regiões, ginásios, Centros de Cura, jogadores e o lendário da vez.
- **Evento dos lendários**: a cada 2 a 3 horas um lendário (Solvaris, Nocteon, Terralith ou
  Abyssion) aparece na clareira do seu bioma por 15 minutos, com aviso no chat. O primeiro a chegar
  enfrenta (nível 60 a 80, difícil de capturar); quem chega depois espera a vez. Fugir deixa ele
  livre para o próximo, com o dano que levou. Capturado ou vencido, some até o próximo evento.
- **Batalha por turnos** decidida no servidor: 13 tipos (Veneno, Gelo, Luz, Psíquico e Sombrio
  são os novos; cada tipo é fraco contra exatamente 2), mesmo tipo ×1,5, críticos, precisão,
  prioridade, 5 estados, fuga, troca de criatura, itens e troca forçada quando alguém desmaia.
- **Captura com Orbi** (Orbi, Orbi Prata, Orbi Ouro), chance maior com Vida baixa e estados.
- **XP dividido** entre quem lutou, subida de nível, golpes novos e **evolução**.
- **Time de até 6** e caixa ilimitada; ordem do time e líder configuráveis.
- **8 ginásios** (um de cada tipo) espalhados pelos biomas, cada um com um Posto de Cura ao lado; os
  mais fortes ficam mais longe da vila. Em cada um você
  enfrenta 2 treinadores e o líder em sequência, sem curar no meio. Níveis 25 e 35 para quem está
  começando e depois 50, 60, 70, 80, 90 e 100; os times usam a forma evoluída das criaturas. Vencer o líder dá a insígnia
  e itens; treinadores trocam de criatura e escolhem golpes com estratégia.
- **Batalha amistosa entre jogadores**: desafie quem estiver perto; os dois escolhem golpe ou troca
  e o turno resolve com as duas escolhas. As criaturas lutam com Vida cheia e ninguém perde nada.
  Dá para desistir; quem sai no meio perde; 60 s por turno (sem resposta, escolhe sozinho).
- **Troca de criaturas**: cada um oferece uma (do time ou da caixa), vê a oferta do outro com quem
  a capturou, e a troca só acontece quando os dois confirmam. Fica registrado quem capturou.
- **Jogável no celular**: controles de toque e telas que cabem em retrato e deitado.
- **Música e efeitos 8-bit originais**, gerados pelo próprio jogo (sem arquivos de áudio): trilhas
  da vila, das rotas, da noite, de batalha e de ginásio, vinhetas de vitória, cura, captura, subida de
  nível e evolução, e efeitos de golpe, desmaio, Orbi, grama e menus. Botão **Som** no topo ajusta
  música e efeitos (fica salvo no navegador).
- **Doce Estelar**: sobe uma criatura 1 nível na hora (com golpes novos e evolução). Na Loja,
  por 1500 Sementes, como prêmio de ginásio e às vezes ao vencer criaturas selvagens (5%, ou 10% a partir do nível 20).
- **Casa do Treinador** (telhado verde, ao sul da praça): troca golpes. Os do repertório da espécie
  (até o nível atual, inclusive os esquecidos) são de graça; golpes do tipo da criatura e Mordida
  Firme/Golpe Bruto custam Sementes e pedem nível mínimo pela força do golpe.
- **Golpe básico próprio de cada criatura** (Patada, Arranhão, Rabada, Mordiscada, Coice...).
- **Centro de Cura**, **Loja** (compra Orbis e Poções; vende itens pela metade do preço e criaturas da
  caixa por Sementes, menos lendários) e **Sementes** ganhas em batalha.
- **A criatura líder do time anda atrás do treinador**, e todos veem.
- **Mercado entre jogadores** (Corretora Lívia, na praça da Vila Broto): anuncie criaturas e itens pelo
  preço que quiser; quem comprar recebe na hora e você recebe as Sementes (menos 5%) na hora ou quando
  entrar de novo. Dá para retirar a oferta.
- **Personagens pelo mundo**: quem troca criaturas (uma vez cada; a nova vem no mesmo nível), quem dá
  missões em sequência (capturar, vencer, derrotar treinadores) com Sementes e itens de recompensa, e
  9 treinadores na estrada que desafiam quem passa perto (vencidos, só no dia seguinte).
- **Mercador viajante**: muda de lugar a cada 30 minutos (aviso no chat e moeda no mapa) e vende itens
  raros: Orbi Ouro, Hiper Poção e Doce Estelar mais barato.
- **XP triplicado** em todas as batalhas.
- **Ciclo dia/noite** (20 min, 6 de noite): à noite aparecem Shado e Batto.
- Multiplayer em tempo real com chat; quem está em batalha mostra um "!".
- Derrota: volta ao Centro de Cura com o time recuperado e perde 10% das Sementes.

## Comandos

```bash
npm test          # motor de batalha + ponta a ponta com clientes reais + modo Supabase (Postgres em memória)
npm run typecheck # tipos do servidor e do cliente
npm run build     # compila o cliente em client/dist
```

Para testar a noite sem esperar: `WILDORA_TIME_OFFSET=<ms> npm run dev` adianta o relógio do jogo.
Para ver um lendário sem esperar horas: `WILDORA_LEGEND_MS=10000 npm run dev` faz o evento começar 10 s depois de abrir a sala.

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
  battle/pvp.ts            batalha entre jogadores (mesmas regras, os dois lados escolhem)
  battle/text.ts           frases dos eventos de batalha
server/
  src/index.ts             sobe o servidor (serve o jogo compilado, /config e /healthz)
  src/config.ts            variáveis de ambiente e .env
  src/auth.ts              login: local ou Supabase (confere o token no Supabase)
  src/store/               progresso: arquivo JSON (modo local) ou Postgres (Supabase)
  src/rooms/WorldRoom.ts   sala do mundo: contas, movimento, batalha, vila, time, chat
  src/schema/WorldState.ts estado sincronizado (jogadores visíveis, noite)
  test/                    testes do motor e de ponta a ponta
client/
  src/auth/                telas de entrar, criar conta, confirmar e-mail e trocar senha
  src/creator/             criação de personagem e escolha do inicial
  src/scenes/WorldScene.ts mundo, jogadores animados, entrada
  src/battle/BattleUI.ts   tela de batalha (só anima o que o servidor manda)
  src/panels/              time, caixa, mochila, loja, diálogos, menu de jogador e troca
  src/touch/               controles de toque (celular)
  src/audio/               música e efeitos sintetizados (trilhas em audio/tracks.ts)
  src/world/art.ts         tileset e objetos em pixel art
  src/avatar/sheet.ts      folha de sprites do personagem para o Phaser
tools/avatar/              moldes do personagem e prévia
tools/creatures/           gerador da pixel art das criaturas (referências + script)
supabase/schema.sql        tabelas do progresso (rodar uma vez no Supabase)
render.yaml                publicação no Render
Dockerfile, deploy/oracle/ imagem do jogo + Caddy (HTTPS) para a Oracle ou qualquer VM
docs/DEPLOY.md             como colocar no ar
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
- **Armazenamento trocável.** A interface `Store` tem duas versões: arquivo JSON com escrita
  atômica (zero instalação) e Postgres em tabelas (Supabase). Ambas juntam as mudanças e gravam
  em lote; ao sair, o progresso é gravado na hora.
- **Login fora do servidor do jogo.** No modo online o navegador fala direto com o Supabase Auth
  (e-mails, senhas, links) e manda só o token; o servidor confere quem é e nunca vê a senha.
- **Estado público × privado.** O `WorldState` só carrega o que os outros veem (nome, posição,
  aparência, se está em batalha, noite). Time, mochila e batalha vão por mensagem direta.

## Próximos passos sugeridos

- Ranking de batalhas amistosas e lista de amigos
- Mapas feitos no Tiled
- Ranking e perfil público lendo as tabelas do Supabase
