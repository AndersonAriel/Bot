# Relatório - Atualização do Bot ATM11 Loja 2A.30

## Objetivo
Atualizar as informações públicas do bot para refletir o sistema novo da Loja ATM11.

## Arquivos alterados
- `src/index.js`
- `.env.example`
- `README.md`
- `package.json`

## Principais mudanças no bot
- `!vip` atualizado para falar de **Pontos VIP**, `/loja` e `/recompensa`.
- `!kits` atualizado com os **46 kits** atuais da loja.
- Novo comando informativo `!loja` explicando como usar a loja dentro do Minecraft.
- `!comandos` atualizado com os comandos atuais do Discord e os comandos do jogo.
- Painel de compra VIP atualizado para trocar “pontos de doação” por **Pontos VIP**.
- Ticket de compra atualizado para exibir **Pontos VIP**.
- Mensagem de VIP entregue atualizada, orientando o player a usar `/loja` e `/recompensa`.
- Mensagem RCON de anúncio VIP atualizada para mencionar os Pontos VIP adicionados.
- `package.json` atualizado para versão `1.1.0-atm11shop-2a30`.
- Dependências fixadas sem `^` e Express atualizado para `4.21.2`.

## Integração com o sistema do servidor
O bot continua adicionando os pontos no scoreboard:

```text
vip_pontos
```

O sistema novo da loja usa o mesmo scoreboard, então os pontos comprados pelo bot aparecem na `/loja`.

A recompensa online continua sendo do lado do KubeJS/FTB Ranks, com o node:

```text
atm11shop.reward_points
```

## Validação
- `node --check src/index.js`: OK

## Observação importante
Este pacote atualiza as informações, comandos e textos do bot. Ele não mexe na lógica da loja do Minecraft, que continua no KubeJS/mod da Loja ATM11.
