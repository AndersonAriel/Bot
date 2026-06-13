# ATM 11 Discord Bot

Bot de Discord do servidor **ATM 11** com rankings via RCON, informações do servidor, sistema VIP por Mercado Pago/Pix e integração com a nova **Loja ATM11**.

## Comandos para players

```text
!ip
!discord
!regras
!vip
!loja
!kits
!status
!online
!evento
!sorteio
!participar
!rank
!rank mobs
!rank mortes
!rank pvp
!rank tempo
!rank minerios
!rank diamantes
!rank ancient
!rank allthemodium
!rank vibranium
!rank unobtainium
!comprarvip
!nick SeuNick
```

## Comandos dentro do Minecraft

```mcfunction
/loja
/recompensa
```

- `/loja` abre a loja visual com categorias, kits e visualização dos itens antes da compra.
- `/recompensa` mostra o tempo restante e a quantidade de Pontos VIP da próxima recompensa online.

## VIP e Pontos VIP

Cada R$1 aprovado pelo Mercado Pago adiciona **1 Ponto VIP** ao saldo do jogador no scoreboard:

```text
vip_pontos
```

O bot aplica o rank no FTB Ranks, adiciona a tag correspondente e soma os Pontos VIP via RCON.

Faixas atuais:

```text
VIP Ferro: R$5 a R$10 — 2 Pontos VIP a cada 5 horas online
VIP Ouro: R$11 a R$20 — 3 Pontos VIP a cada 5 horas online
VIP Diamante: R$21 a R$30 — 5 Pontos VIP a cada 5 horas online
VIP Netherita: R$31 ou mais — 8 Pontos VIP a cada 5 horas online
```

A recompensa online correta depende do FTB Ranks ter o node:

```text
atm11shop.reward_points
```

## Comandos Staff

```text
!setevento Título | Data | Prêmio | Texto
!removerevento
!criarsorteio Título | Prêmio | Data | Texto
!sortear
!cancelarsorteio
!finalizarsorteio
!vipsetup
!painelvip
!vipconfig
```

## Instalação

```bash
npm install
cp .env.example .env
npm start
```

No `server.properties` do Minecraft:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=COLOQUE_UMA_SENHA_FORTE
```

## Variáveis Railway

Veja `.env.example` para todas as variáveis necessárias.

Variáveis principais:

```env
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=
PREFIX=!
RCON_HOST=
RCON_PORT=25575
RCON_PASSWORD=
MP_ACCESS_TOKEN=
PUBLIC_URL=
VIP_PANEL_CHANNEL_ID=
VIP_CATEGORY_ID=
VIP_LOG_CHANNEL_ID=
VIP_STAFF_ROLE_ID=
```

## Datapack de rankings

Se usar os rankings do bot, mantenha o datapack:

```text
datapack/atm11_rankings_discord
```

em:

```text
world/datapacks/
```

Depois rode no servidor:

```mcfunction
/reload
/function atmrank:calc
```
