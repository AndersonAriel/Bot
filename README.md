# ATM 11 Rank Bot

Bot de Discord para rankings do servidor **ATM 11** usando **RCON**.

## Comandos

```text
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
```

## Segurança

O bot não executa comando livre enviado pelo Discord.  
Ele só usa comandos fixos internos para consultar scoreboards de ranking.

## Instalar datapack no Minecraft

Copie:

```text
datapack/atm11_rankings_discord
```

para:

```text
world/datapacks/
```

Depois rode:

```mcfunction
/reload
/function atmrank:calc
```

## Ativar RCON

No `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=COLOQUE_UMA_SENHA_FORTE
```

Reinicie o servidor depois de alterar.

## Railway Variables

No Railway, coloque:

```env
DISCORD_TOKEN=token_do_bot
DISCORD_CHANNEL_ID=1511957022860382288
PREFIX=!
RCON_HOST=ip_ou_host_do_servidor
RCON_PORT=25575
RCON_PASSWORD=senha_rcon
TOP_LIMIT=10
```

Se a hospedagem der uma porta diferente para RCON, use a porta correta.

## Criar bot no Discord

1. Entre em https://discord.com/developers/applications
2. Crie uma aplicação nova
3. Vá em **Bot**
4. Copie o token
5. Ative **Message Content Intent**
6. Convide o bot para seu servidor

Permissões mínimas:

```text
View Channels
Send Messages
Embed Links
Read Message History
```

## Rodar localmente

```bash
npm install
cp .env.example .env
npm start
```
