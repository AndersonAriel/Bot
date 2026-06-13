require("dotenv").config();

const {Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ButtonBuilder, ButtonStyle} = require("discord.js");
const { Rcon } = require("rcon-client");
const fs = require("fs");
const path = require("path");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "";
const GENERAL_COMMAND_CHANNEL_ID = process.env.GENERAL_COMMAND_CHANNEL_ID || CHANNEL_ID || "";
const RANK_COMMAND_CHANNEL_ID = process.env.RANK_COMMAND_CHANNEL_ID || CHANNEL_ID || "";
const GIVEAWAY_COMMAND_CHANNEL_ID = process.env.GIVEAWAY_COMMAND_CHANNEL_ID || CHANNEL_ID || "";
const STAFF_COMMAND_CHANNEL_ID = process.env.STAFF_COMMAND_CHANNEL_ID || CHANNEL_ID || "";
const PREFIX = process.env.PREFIX || "!";
const TOP_LIMIT = Number(process.env.TOP_LIMIT || 10);

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = Number(process.env.RCON_PORT || 25575);
const RCON_PASSWORD = process.env.RCON_PASSWORD;

const DATA_DIR = path.join(process.cwd(), "data");
const EVENT_FILE = path.join(DATA_DIR, "evento.json");
const GIVEAWAY_FILE = path.join(DATA_DIR, "sorteio.json");

const PURCHASES_FILE = path.join(DATA_DIR, "compras_vip.json");
const VIP_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "vip_assinaturas.json");
const DAY_MS = 24 * 60 * 60 * 1000;
const VIP_DURATION_DAYS = Math.max(1, Number(process.env.VIP_DURATION_DAYS || 30));
const VIP_EXPIRY_CHECK_INTERVAL_MINUTES = Math.max(5, Number(process.env.VIP_EXPIRY_CHECK_INTERVAL_MINUTES || 60));
const VIP_WARNING_DAYS = [5, 4, 3, 2, 1];
const VIP_TICKET_AUTO_CLOSE_MINUTES = Math.max(1, Number(process.env.VIP_TICKET_AUTO_CLOSE_MINUTES || 10));
const VIP_UNPAID_STATUSES = new Set(["criando_pagamento", "aguardando_pagamento", "erro_pagamento"]);
const VIP_DELIVERY_PENDING_STATUSES = new Set(["pagamento_aprovado", "nick_informado", "aguardando_entrega", "erro_entrega"]);

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";
const MP_POLL_INTERVAL_SECONDS = Number(process.env.MP_POLL_INTERVAL_SECONDS || 20);
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const VIP_PANEL_CHANNEL_ID = process.env.VIP_PANEL_CHANNEL_ID || "";
const VIP_CATEGORY_ID = process.env.VIP_CATEGORY_ID || "";
const VIP_LOG_CHANNEL_ID = process.env.VIP_LOG_CHANNEL_ID || "";
const VIP_STAFF_ROLE_ID = process.env.VIP_STAFF_ROLE_ID || "";

const vipRanges = [
  { key: "ferro", name: "VIP Ferro", emoji: "⚒️", min: 5, max: 10, rank: "vip_ferro", rewardText: "2 Pontos VIP a cada 5 horas online" },
  { key: "ouro", name: "VIP Ouro", emoji: "🟡", min: 11, max: 20, rank: "vip_ouro", rewardText: "3 Pontos VIP a cada 5 horas online" },
  { key: "diamante", name: "VIP Diamante", emoji: "💎", min: 21, max: 30, rank: "vip_diamante", rewardText: "5 Pontos VIP a cada 5 horas online" },
  { key: "netherita", name: "VIP Netherita", emoji: "🔥", min: 31, max: 9999, rank: "vip_netherita", rewardText: "8 Pontos VIP a cada 5 horas online" }
];


const defaultEvent = {
  ativo: true,
  titulo: process.env.EVENTO_TITULO || "🎉 Evento valendo VIP",
  data: process.env.EVENTO_DATA || "Final de semana",
  premio: process.env.EVENTO_PREMIO || "VIP para o vencedor",
  texto: process.env.EVENTO_TEXTO || "No próximo final de semana teremos evento valendo VIP. O formato ainda será anunciado, mas a ideia é fazer algo divertido, justo e bem legal para todos participarem."
};


if (!TOKEN) {
  console.error("ERRO: DISCORD_TOKEN não configurado.");
  process.exit(1);
}

if (!RCON_HOST || !RCON_PASSWORD) {
  console.error("ERRO: RCON_HOST ou RCON_PASSWORD não configurado.");
  process.exit(1);
}

const ranks = {
  mobs: { title: "⚔️ Top Mobs Mortos", objective: "rank_mobs", suffix: "mobs mortos", description: "Jogadores que mais mataram mobs." },
  mortes: { title: "☠️ Top Mortes", objective: "rank_mortes", suffix: "mortes", description: "Jogadores que mais morreram." },
  pvp: { title: "🗡️ Top PvP", objective: "rank_player_kills", suffix: "kills", description: "Jogadores com mais kills de players." },
  tempo: { title: "⏱️ Top Tempo Online", objective: "rank_horas", suffix: "horas online aprox.", description: "Jogadores com mais tempo online." },
  minerios: { title: "⛏️ Top Minérios Minerados", objective: "rank_minerios", suffix: "minérios", description: "Soma dos principais minérios minerados." },
  diamantes: { title: "💎 Top Diamantes Minerados", objective: "rank_diamantes_total", suffix: "diamantes", description: "Diamante normal + deepslate." },
  ancient: { title: "🔥 Top Ancient Debris", objective: "rank_ancient", suffix: "ancient debris", description: "Jogadores que mais mineraram Ancient Debris." },
  allthemodium: { title: "✨ Top AllTheModium Minerado", objective: "rank_atm_total", suffix: "minérios", description: "AllTheModium normal + deepslate." },
  vibranium: { title: "💜 Top Vibranium Minerado", objective: "rank_vib_total", suffix: "minérios", description: "Vibranium somado." },
  unobtainium: { title: "🌌 Top Unobtainium Minerado", objective: "rank_unobtainium", suffix: "minérios", description: "Unobtainium minerado." }
};

function isRealPlayerName(name) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name) && !name.startsWith("#");
}

async function withRcon(callback) {
  const rcon = await Rcon.connect({
    host: RCON_HOST,
    port: RCON_PORT,
    password: RCON_PASSWORD
  });

  try {
    return await callback(rcon);
  } finally {
    await rcon.end();
  }
}

function stripMinecraftFormatting(text) {
  return String(text || "").replace(/§[0-9A-FK-OR]/gi, "");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOnlinePlayersFromList(output) {
  const clean = stripMinecraftFormatting(output);
  const colonIndex = clean.indexOf(":");
  if (colonIndex < 0) return [];
  return clean
    .slice(colonIndex + 1)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function isNickInOnlineList(players, nick) {
  const wantedRaw = String(nick || "").trim();
  const wanted = wantedRaw.toLowerCase();
  if (!wanted) return false;

  const exactNickRegex = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(wantedRaw)}([^A-Za-z0-9_]|$)`, "i");

  return Array.isArray(players) && players.some((player) => {
    const clean = stripMinecraftFormatting(player).trim();
    if (!clean) return false;

    // Alguns servidores/mods colocam prefixos no /list, por exemplo:
    // "[◆ Membro ◆] AndersonAriel". A checagem precisa procurar só o nick puro.
    if (clean.toLowerCase() === wanted) return true;
    return exactNickRegex.test(clean);
  });
}

function looksLikeOfflinePlayerResult(output) {
  const clean = stripMinecraftFormatting(output).toLowerCase();
  return (
    clean.includes("no entity was found") ||
    clean.includes("no player was found") ||
    clean.includes("found no elements") ||
    clean.includes("test failed") ||
    clean.includes("unknown or incomplete command") ||
    clean.includes("não foi encontrado") ||
    clean.includes("nenhum")
  );
}

async function isPlayerOnlineByList(rcon, nick) {
  const wantedRaw = String(nick || "").trim();
  if (!isValidMinecraftNick(wantedRaw)) return false;

  // Checagem principal: consulta a entidade online pelo nick exato.
  // Isso evita confundir prefixos/tags do chat ou nomes decorados do FTB Ranks.
  try {
    const output = await rcon.send(`data get entity ${wantedRaw} UUID`);
    const clean = stripMinecraftFormatting(output);

    if (!looksLikeOfflinePlayerResult(clean)) {
      const nickRegex = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(wantedRaw)}([^A-Za-z0-9_]|$)`, "i");
      if (nickRegex.test(clean) || clean.toLowerCase().includes("uuid")) return true;
    }
  } catch {
    // Se algum servidor bloquear o data get, cai no fallback do /list abaixo.
  }

  // Fallback: usa /list, mas ainda procurando o nick puro dentro de entradas com prefixo.
  const output = await rcon.send("list");
  const players = parseOnlinePlayersFromList(output);
  return isNickInOnlineList(players, wantedRaw);
}

function parseScoreholders(output) {
  const text = String(output || "");
  const colonIndex = text.indexOf(":");
  const listPart = colonIndex >= 0 ? text.slice(colonIndex + 1) : text;

  return [...new Set(
    listPart
      .split(",")
      .map((x) => x.trim())
      .map((x) => x.replace(/[^\w]/g, ""))
      .filter(isRealPlayerName)
  )];
}

function parseScore(output) {
  const match = String(output || "").match(/has\s+(-?\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function getAllPlayers(rcon) {
  const output = await rcon.send("scoreboard players list");
  return parseScoreholders(output);
}

async function getScore(rcon, player, objective) {
  try {
    const output = await rcon.send(`scoreboard players get ${player} ${objective}`);
    return parseScore(output);
  } catch {
    return 0;
  }
}

async function getRanking(rankKey) {
  const rank = ranks[rankKey];
  if (!rank) throw new Error("Ranking inválido.");

  return await withRcon(async (rcon) => {
    try {
      await rcon.send("function atmrank:calc");
    } catch (err) {
      console.warn("Aviso: não consegui executar function atmrank:calc. O datapack está instalado?", err.message);
    }

    const players = await getAllPlayers(rcon);
    const rows = [];

    for (const player of players) {
      const score = await getScore(rcon, player, rank.objective);
      if (score > 0) rows.push({ player, score });
    }

    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, TOP_LIMIT);
  });
}

function buildMenuEmbed() {
  const lines = Object.entries(ranks)
    .map(([key, rank]) => `**${PREFIX}rank ${key}** — ${rank.description}`)
    .join("\n");

  return new EmbedBuilder()
    .setTitle("🏆 Rankings ATM 11")
    .setDescription(lines)
    .setColor(0x8a2be2)
    .setFooter({ text: "Servidor ATM 11 Brasil" });
}


function baseEmbed(title, description, color = 0x8a2be2) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Nice Craft • ATM 11 Brasil" })
    .setTimestamp();
}

function buildIpEmbed() {
  return baseEmbed(
    "🌐 IP do Servidor ATM 11",
    [
      "**Servidor brasileiro de All The Mods 11!**",
      "",
      "📌 **IP:** `niceatm11.jogar.io`",
      "",
      "Entre, chame seus amigos e bora evoluir juntos! 🚀"
    ].join("\n"),
    0x00bfff
  );
}

function buildDiscordEmbed() {
  return baseEmbed(
    "💬 Discord do Servidor",
    [
      "Entre no nosso Discord para avisos, suporte, eventos e novidades:",
      "",
      "🔗 https://discord.gg/bZQsTfyCUt"
    ].join("\n"),
    0x5865f2
  );
}

function buildRegrasEmbed() {
  return baseEmbed(
    "📜 Regras do Servidor",
    [
      "✅ Respeite todos os jogadores e a Staff.",
      "❌ Proibido dupe, abuso de bug, roubo, grief e tentativa de burlar sistemas.",
      "❌ Sem homofobia, racismo, preconceito, ameaças, conteúdo pesado ou brigas no chat.",
      "⚙️ Use farms e máquinas com responsabilidade para não causar lag.",
      "🛒 Não tente burlar loja, VIPs, pontos ou recompensas.",
      "",
      "⚠️ Punições podem ser: **advertência**, **ban temporário** ou **ban permanente**, dependendo da gravidade."
    ].join("\n"),
    0xffcc00
  );
}

function buildVipEmbed() {
  return baseEmbed(
    "💎 Sistema de VIPs ATM 11",
    [
      "Ao apoiar o servidor, você recebe o VIP correspondente à faixa de doação e ganha **Pontos VIP** para usar na loja do jogo.",
      "",
      "📌 **Comandos úteis dentro do servidor:**",
      "• `/loja` — abre a loja visual de kits",
      "• `/recompensa` — mostra o tempo restante para a próxima recompensa online",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "⚒️ **VIP Ferro** — Doações de **R$5 a R$10**",
      "🧱 Claims: **15 chunks**",
      "⚡ Force load: **8 chunks**",
      "🏠 Homes: **3 homes**",
      "⏳ Cooldown de home: **2 minutos**",
      "↩️ /back: **5 minutos**",
      "🌍 /spawn: **instantâneo**",
      "🎲 /rtp: **30 minutos**",
      "🎁 Recompensa online: **2 Pontos VIP a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "🟡 **VIP Ouro** — Doações de **R$11 a R$20**",
      "🧱 Claims: **50 chunks**",
      "⚡ Force load: **30 chunks**",
      "🏠 Homes: **10 homes**",
      "⏳ Cooldown de home: **30 segundos**",
      "↩️ /back: **1 minuto**",
      "🌍 /spawn: **instantâneo**",
      "🎲 /rtp: **15 minutos**",
      "🎁 Recompensa online: **3 Pontos VIP a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "💎 **VIP Diamante** — Doações de **R$21 a R$30**",
      "🧱 Claims: **100 chunks**",
      "⚡ Force load: **60 chunks**",
      "🏠 Homes: **20 homes**",
      "⏳ Cooldown de home: **5 segundos**",
      "↩️ /back: **30 segundos**",
      "🌍 /spawn: **instantâneo**",
      "🎲 /rtp: **5 minutos**",
      "🎁 Recompensa online: **5 Pontos VIP a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "🔥 **VIP Netherita** — Doações de **R$31 ou mais**",
      "🧱 Claims: **500 chunks**",
      "⚡ Force load: **120 chunks**",
      "🏠 Homes: **50 homes**",
      "⏳ Cooldown de home: **instantâneo**",
      "↩️ /back: **instantâneo**",
      "🌍 /spawn: **instantâneo**",
      "🎲 /rtp: **instantâneo**",
      "🎁 Recompensa online: **8 Pontos VIP a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "💰 **Pontos VIP:** cada R$1 aprovado adiciona 1 Ponto VIP ao seu saldo.",
      `📅 **Duração do VIP:** ${VIP_DURATION_DAYS} dias após a entrega.`,
      "🛒 Use seus Pontos VIP em `/loja` para comprar kits.",
      "🔎 Use `/recompensa` para ver quando recebe a próxima recompensa online."
    ].join("\n"),
    0xff9900
  );
}

function buildKitsEmbed() {
  return baseEmbed(
    "🛒 Kits da Loja ATM 11",
    [
      "Use `/loja` no servidor para abrir a loja visual.",
      "Antes de comprar, clique em **Ver itens do kit** para conferir tudo.",
      "",
      "**🧰 Kits Básicos**",
      "• Comida — `1 PV`",
      "• Mineração [Ferro] — `2 PV`",
      "• Mineração [Diamante] — `4 PV`",
      "• Mineração [Netherita] — `8 PV`",
      "• Poção — `2 PV`",
      "• Viagem [Waystones] — `2 PV`",
      "",
      "**💠 Applied Energistics 2**",
      "• AE2 [Básico] — `5 PV`",
      "• AE2 [Avançado] — `30 PV`",
      "• Advanced AE [Armadura AE] — `40 PV`",
      "• Advanced AE [Super Processador] — `50 PV`",
      "",
      "**🎒 Armazenamento e Mochilas**",
      "• Mochila [Ferro] — `2 PV`",
      "• Mochila [Diamante] — `8 PV`",
      "• Armazenamento [Sophisticated] — `10 PV`",
      "• Dimensional Storage — `2 PV`",
      "",
      "**🏘️ Easy Villagers**",
      "• Aldeões [Easy Villagers] — `2 PV`",
      "• Aldeões [Premium] — `8 PV`",
      "",
      "**⚙️ Tecnologia e Modpack**",
      "• Construção [Building Gadgets] — `10 PV`",
      "• Energia [Powah Niotic] — `10 PV`",
      "• Energia [Powah Nitro] — `20 PV`",
      "• Refined Storage [Básico] — `5 PV`",
      "• Refined Storage [Avançado] — `15 PV`",
      "• Mystical Agriculture [Início] — `5 PV`",
      "• Occultism [Giz] — `30 PV`",
      "• Occultism [Minérios Infinitos] — `40 PV`",
      "• Occultism [Minérios Infinitos com Encantamentos] — `60 PV`",
      "• Apotheosis [Mesa e Estantes] — `25 PV`",
      "• Apotheosis [Mesa Configurável] — `20 PV`",
      "• Mystical Agriculture [Sementes de Minérios] — `5 PV`",
      "• Mystical Agriculture [Armadura Supremium + Aprimoramentos V] — `30 PV`",
      "• Just Dire Things [Gosma VoidShimmer] — `5 PV`",
      "• Just Dire Things [Gosma Shadowpulse] — `10 PV`",
      "• Just Dire Things [Coletor/Transmissor/Depósito] — `3 PV`",
      "• Just Dire Things [Máquinas] — `3 PV`",
      "• Just Dire Things [Varinha do Tempo] — `15 PV`",
      "• Just Dire Things [Arma + Ferramentas] — `15 PV`",
      "• Just Dire Things [Armadura] — `10 PV`",
      "• Just Dire Things [Todos os Aprimoramentos] — `50 PV`",
      "• Productive Bees [Básico] — `10 PV`",
      "• Productive Bees [Avançado] — `10 PV`",
      "",
      "**✨ AllTheModium**",
      "• AllTheModium [Ferramentas] — `20 PV`",
      "• AllTheModium [Armadura] — `30 PV`",
      "• Vibranium [Ferramentas] — `25 PV`",
      "• Vibranium [Armadura] — `35 PV`",
      "• Unobtainium [Ferramentas] — `30 PV`",
      "• Unobtainium [Armadura] — `40 PV`",
      "• AllTheModium [Armas de Liga] — `50 PV`",
      ""
    ].join("\n"),
    0x22cc66
  );
}


function buildLojaEmbed() {
  return baseEmbed(
    "🛒 Loja ATM11 no Servidor",
    [
      "A loja nova é aberta **dentro do Minecraft** pelo comando:",
      "",
      "`/loja`",
      "",
      "Na loja você encontra categorias organizadas, kits com ícones dos mods e uma tela para visualizar os itens antes de comprar.",
      "",
      "💰 **Moeda usada:** Pontos VIP",
      "🎁 **Recompensa online:** veja com `/recompensa`",
      "🔎 **Antes de comprar:** clique em **Ver itens do kit** para conferir todos os itens e quantidades.",
      "",
      "Use `!kits` aqui no Discord para ver a lista de kits e preços."
    ].join("\n"),
    0x22cc66
  );
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadEvento() {
  ensureDataDir();

  if (!fs.existsSync(EVENT_FILE)) {
    saveEvento(defaultEvent);
    return { ...defaultEvent };
  }

  try {
    const data = JSON.parse(fs.readFileSync(EVENT_FILE, "utf8"));
    return {
      ativo: data.ativo !== false,
      titulo: data.titulo || defaultEvent.titulo,
      data: data.data || defaultEvent.data,
      premio: data.premio || defaultEvent.premio,
      texto: data.texto || defaultEvent.texto
    };
  } catch {
    saveEvento(defaultEvent);
    return { ...defaultEvent };
  }
}

function saveEvento(evento) {
  ensureDataDir();
  fs.writeFileSync(EVENT_FILE, JSON.stringify(evento, null, 2), "utf8");
}

function hasEventPermission(message) {
  return message.member?.permissions?.has("ManageGuild") || message.member?.permissions?.has("Administrator");
}

function parseSetEvento(rawText) {
  const parts = rawText.split("|").map((part) => part.trim());

  if (parts.length < 4) {
    return null;
  }

  return {
    ativo: true,
    titulo: parts[0],
    data: parts[1],
    premio: parts[2],
    texto: parts.slice(3).join(" | ")
  };
}

function buildEventoEmbed() {
  const evento = loadEvento();

  if (!evento.ativo) {
    return baseEmbed(
      "🎉 Evento",
      [
        "No momento não existe evento ativo.",
        "",
        "Quando a Staff criar um novo evento, ele aparecerá aqui."
      ].join("\n"),
      0xffcc00
    );
  }

  return baseEmbed(
    evento.titulo,
    [
      `📅 **Data:** ${evento.data}`,
      `🎁 **Prêmio:** ${evento.premio}`,
      "",
      evento.texto,
      "",
      "Fique ligado nos avisos do Discord!"
    ].join("\n"),
    0xff00aa
  );
}

function buildRankingEmbed(rankKey, rows) {
  const rank = ranks[rankKey];

  const description = rows.length
    ? rows.map((row, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
        return `${medal} **${row.player}** — \`${row.score}\` ${rank.suffix}`;
      }).join("\n")
    : "Ainda não há dados suficientes para este ranking.";

  return new EmbedBuilder()
    .setTitle(rank.title)
    .setDescription(description)
    .setColor(0x00bfff)
    .setFooter({ text: "Rankings atualizados pelo servidor ATM 11" })
    .setTimestamp();
}


function parseListOutput(output) {
  const text = String(output || "").trim();

  // Formato comum: "There are 2 of a max of 20 players online: A, B"
  const match = text.match(/There are\s+(\d+)\s+of a max of\s+(\d+)\s+players online(?::\s*(.*))?/i);

  if (!match) {
    return {
      online: 0,
      max: 0,
      players: [],
      raw: text
    };
  }

  const online = Number(match[1] || 0);
  const max = Number(match[2] || 0);
  const playersText = (match[3] || "").trim();

  const players = playersText
    ? playersText.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  return { online, max, players, raw: text };
}


async function getServerListInfo() {
  return await withRcon(async (rcon) => {
    const output = await rcon.send("list");
    return parseListOutput(output);
  });
}

async function buildStatusEmbed() {
  const info = await getServerListInfo();

  return baseEmbed(
    "🌐 Status do Servidor ATM 11",
    [
      "✅ **Servidor online**",
      "",
      `📌 **IP:** \`niceatm11.jogar.io\``,
      `👥 **Jogadores:** \`${info.online}/${info.max}\``,
      "",
      info.players.length
        ? `🟢 **Online agora:**\n${info.players.map((p) => `• ${p}`).join("\n")}`
        : "🟡 **Online agora:** nenhum jogador online.",
      "",
      "⚙️ Modpack: **All The Mods 11**"
    ].join("\n"),
    0x22cc66
  );
}

async function buildOnlineEmbed() {
  const info = await getServerListInfo();

  return baseEmbed(
    "👥 Jogadores Online",
    [
      `Atualmente temos **${info.online}/${info.max}** jogadores online.`,
      "",
      info.players.length
        ? info.players.map((p, index) => `**${index + 1}.** ${p}`).join("\n")
        : "Nenhum jogador online no momento."
    ].join("\n"),
    0x00bfff
  );
}



function defaultSorteio() {
  return {
    ativo: false,
    titulo: "🎁 Sorteio valendo VIP",
    premio: "VIP Ferro",
    data: "Em breve",
    texto: "Participe do sorteio do servidor ATM 11!",
    participantes: []
  };
}

function loadSorteio() {
  ensureDataDir();

  if (!fs.existsSync(GIVEAWAY_FILE)) {
    const sorteio = defaultSorteio();
    saveSorteio(sorteio);
    return sorteio;
  }

  try {
    const data = JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
    return {
      ativo: Boolean(data.ativo),
      titulo: data.titulo || "🎁 Sorteio valendo VIP",
      premio: data.premio || "VIP Ferro",
      data: data.data || "Em breve",
      texto: data.texto || "Participe do sorteio do servidor ATM 11!",
      participantes: Array.isArray(data.participantes) ? data.participantes : []
    };
  } catch {
    const sorteio = defaultSorteio();
    saveSorteio(sorteio);
    return sorteio;
  }
}

function saveSorteio(sorteio) {
  ensureDataDir();
  fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(sorteio, null, 2), "utf8");
}

function parseCriarSorteio(rawText) {
  const parts = rawText.split("|").map((part) => part.trim());

  if (parts.length < 4) {
    return null;
  }

  return {
    ativo: true,
    titulo: parts[0],
    premio: parts[1],
    data: parts[2],
    texto: parts.slice(3).join(" | "),
    participantes: []
  };
}

function buildSorteioEmbed() {
  const sorteio = loadSorteio();

  if (!sorteio.ativo) {
    return baseEmbed(
      "🎁 Sorteio",
      [
        "No momento não existe sorteio ativo.",
        "",
        "Quando a Staff criar um sorteio, ele aparecerá aqui.",
        "",
        "Comando para participar quando tiver sorteio:",
        `\`${PREFIX}participar\``
      ].join("\n"),
      0xffcc00
    );
  }

  return baseEmbed(
    sorteio.titulo,
    [
      `🎁 **Prêmio:** ${sorteio.premio}`,
      `📅 **Data:** ${sorteio.data}`,
      `👥 **Participantes:** ${sorteio.participantes.length}`,
      "",
      sorteio.texto,
      "",
      `Para participar, digite: \`${PREFIX}participar\``
    ].join("\n"),
    0xff00aa
  );
}

function addParticipante(message) {
  const sorteio = loadSorteio();

  if (!sorteio.ativo) {
    return {
      ok: false,
      message: "❌ Não existe sorteio ativo no momento."
    };
  }

  const userId = message.author.id;

  if (sorteio.participantes.includes(userId)) {
    return {
      ok: false,
      message: "⚠️ Você já está participando deste sorteio."
    };
  }

  sorteio.participantes.push(userId);
  saveSorteio(sorteio);

  return {
    ok: true,
    message: `✅ ${message.author} entrou no sorteio **${sorteio.titulo}**!`
  };
}

function pickWinner() {
  const sorteio = loadSorteio();

  if (!sorteio.ativo) {
    return {
      ok: false,
      message: "❌ Não existe sorteio ativo para sortear."
    };
  }

  if (!sorteio.participantes.length) {
    return {
      ok: false,
      message: "❌ Não há participantes no sorteio."
    };
  }

  const winnerIndex = Math.floor(Math.random() * sorteio.participantes.length);
  const winnerId = sorteio.participantes[winnerIndex];
  const totalBeforeDraw = sorteio.participantes.length;

  // Remove o vencedor da lista para permitir sortear novamente
  // caso ele não faça mais parte do servidor ou não possa receber o prêmio.
  sorteio.participantes.splice(winnerIndex, 1);

  const remainingParticipants = sorteio.participantes.length;

  // O sorteio continua ativo enquanto ainda houver participantes para re-sortear.
  // Se acabar a lista, ele é encerrado automaticamente.
  if (remainingParticipants <= 0) {
    sorteio.ativo = false;
  }

  saveSorteio(sorteio);

  return {
    ok: true,
    winnerId,
    titulo: sorteio.titulo,
    premio: sorteio.premio,
    participantes: totalBeforeDraw,
    restantes: remainingParticipants,
    aindaAtivo: sorteio.ativo
  };
}

function buildComandosEmbed() {
  return baseEmbed(
    "🤖 Comandos do Bot ATM 11",
    [
      "**Canais separados:**",
      `Comandos gerais: ${formatDiscordChannel(GENERAL_COMMAND_CHANNEL_ID, "canal geral")}`,
      `Rankings: ${formatDiscordChannel(RANK_COMMAND_CHANNEL_ID, "canal de rankings")}`,
      `Sorteios/Eventos: ${formatDiscordChannel(GIVEAWAY_COMMAND_CHANNEL_ID, "canal de sorteios")}`,
      `Compra VIP: ${formatDiscordChannel(VIP_PANEL_CHANNEL_ID, "canal de compra VIP")}`,
      `Staff: ${formatDiscordChannel(STAFF_COMMAND_CHANNEL_ID, "canal da Staff")}`,
      "",
      "**Informações:**",
      `\`${PREFIX}ip\` — IP do servidor`,
      `\`${PREFIX}discord\` — link do Discord`,
      `\`${PREFIX}regras\` — regras do servidor`,
      `\`${PREFIX}vip\` — benefícios dos VIPs`,
      `\`${PREFIX}loja\` — como usar a loja no jogo`,
      `\`${PREFIX}kits\` — kits da loja e preços`,
      "",
      "**Comandos dentro do Minecraft:**",
      "`/loja` — abre a loja visual",
      "`/recompensa` — mostra o tempo da próxima recompensa online",
      "",
      "**Servidor:**",
      `\`${PREFIX}status\` — status do servidor`,
      `\`${PREFIX}online\` — jogadores online`,
      "",
      "**Eventos e sorteios:**",
      `\`${PREFIX}evento\` — evento atual`,
      `\`${PREFIX}comprarvip\` — painel de compra VIP por Pix`,
      `\`${PREFIX}sorteio\` — sorteio atual`,
      `\`${PREFIX}participar\` — participar do sorteio ativo`,
      "",
      "**Rankings:**",
      `\`${PREFIX}rank\` — menu de rankings`,
      `\`${PREFIX}rank mobs\``,
      `\`${PREFIX}rank mortes\``,
      `\`${PREFIX}rank minerios\``,
      `\`${PREFIX}rank tempo\``,
      "",
      "**Staff:**",
      `\`${PREFIX}setevento Título | Data | Prêmio | Texto\``,
      `\`${PREFIX}removerevento\``,
      `\`${PREFIX}criarsorteio Título | Prêmio | Data | Texto\``,
      `\`${PREFIX}sortear\``,
      `\`${PREFIX}cancelarsorteio\``,
      `\`${PREFIX}finalizarsorteio\``,
      `\`${PREFIX}vipsetup\` — criar painel VIP`,
      `\`${PREFIX}vipconfig\` — conferir configuração VIP/Mercado Pago`,
      `\`${PREFIX}vipativos\` — listar VIPs ativos registrados pelo bot`,
      `\`${PREFIX}vipcheck\` — forçar verificação de avisos/vencimentos VIP`
    ].join("\n"),
    0x8a2be2
  );
}


function loadComprasVip() {
  ensureDataDir();
  if (!fs.existsSync(PURCHASES_FILE)) {
    saveComprasVip([]);
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(PURCHASES_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    saveComprasVip([]);
    return [];
  }
}

function saveComprasVip(compras) {
  ensureDataDir();
  fs.writeFileSync(PURCHASES_FILE, JSON.stringify(compras, null, 2), "utf8");
}

function updateCompraVip(updatedCompra) {
  const compras = loadComprasVip();
  const index = compras.findIndex((compra) => compra.id === updatedCompra.id);
  if (index >= 0) compras[index] = updatedCompra;
  else compras.push(updatedCompra);
  saveComprasVip(compras);
}

function loadVipSubscriptions() {
  ensureDataDir();

  if (!fs.existsSync(VIP_SUBSCRIPTIONS_FILE)) {
    saveVipSubscriptions([]);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(VIP_SUBSCRIPTIONS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    saveVipSubscriptions([]);
    return [];
  }
}

function saveVipSubscriptions(subscriptions) {
  ensureDataDir();
  fs.writeFileSync(VIP_SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2), "utf8");
}

function formatDateTimeBR(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "data inválida";
  return date.toLocaleString("pt-BR", { timeZone: "America/Campo_Grande" });
}

function getVipRankList() {
  return vipRanges.map((vip) => vip.rank).filter(Boolean);
}

function getActiveVipSubscriptionForNick(subscriptions, nick) {
  const normalizedNick = String(nick || "").toLowerCase();
  const now = Date.now();

  return subscriptions
    .filter((sub) =>
      String(sub.nick || "").toLowerCase() === normalizedNick &&
      sub.status === "active" &&
      new Date(sub.expiresAt).getTime() > now
    )
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0] || null;
}

function upsertVipSubscription(compra, nick) {
  const subscriptions = loadVipSubscriptions();
  const now = new Date();
  const existing = getActiveVipSubscriptionForNick(subscriptions, nick);
  const startDate = existing ? new Date(existing.expiresAt) : now;
  const expiresAt = new Date(startDate.getTime() + VIP_DURATION_DAYS * DAY_MS);
  const vip = compra.vip;

  if (existing) {
    existing.vipKey = vip.key;
    existing.vipName = vip.name;
    existing.rank = vip.rank;
    existing.points = Number(existing.points || 0) + Number(compra.points || 0);
    existing.lastPurchaseId = compra.id;
    existing.purchaseIds = Array.isArray(existing.purchaseIds) ? existing.purchaseIds : [];
    if (!existing.purchaseIds.includes(compra.id)) existing.purchaseIds.push(compra.id);
    existing.amount = Number(existing.amount || 0) + Number(compra.amount || 0);
    existing.expiresAt = expiresAt.toISOString();
    existing.status = "active";
    existing.warningDaysSent = [];
    existing.updatedAt = now.toISOString();
    saveVipSubscriptions(subscriptions);
    return existing;
  }

  const subscription = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    purchaseIds: [compra.id],
    lastPurchaseId: compra.id,
    discordUserId: compra.discordUserId || null,
    discordTag: compra.discordTag || null,
    nick,
    vipKey: vip.key,
    vipName: vip.name,
    rank: vip.rank,
    amount: Number(compra.amount || 0),
    points: Number(compra.points || 0),
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "active",
    warningDaysSent: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  subscriptions.push(subscription);
  saveVipSubscriptions(subscriptions);
  return subscription;
}

function buildTellrawComponents(text, color = "yellow") {
  return [
    { text: "✦ ", color: "gold", bold: true },
    { text, color }
  ];
}

async function sendTellrawToPlayer(rcon, nick, text, color = "yellow") {
  await rcon.send(`tellraw ${nick} ${JSON.stringify(buildTellrawComponents(text, color))}`);
}

function subscriptionRemainingDay(expiresAt) {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / DAY_MS);
}

async function expireVipSubscription(rcon, subscription, onlinePlayers) {
  await rcon.send(`ftbranks remove ${subscription.nick} ${subscription.rank}`);

  subscription.status = "expired";
  subscription.expiredAt = new Date().toISOString();
  subscription.removedAt = new Date().toISOString();
  subscription.updatedAt = new Date().toISOString();

  if (isNickInOnlineList(onlinePlayers, subscription.nick)) {
    await sendTellrawToPlayer(
      rcon,
      subscription.nick,
      `Seu ${subscription.vipName} venceu e foi removido. Renove pelo Discord para recuperar os benefícios.`,
      "red"
    ).catch(() => {});
  }

  await notifyVipLog(null, `⛔ VIP expirado/removido: ${subscription.nick} | ${subscription.vipName} | rank ${subscription.rank}`);
}

async function warnVipSubscription(rcon, subscription, daysRemaining) {
  await sendTellrawToPlayer(
    rcon,
    subscription.nick,
    `Seu ${subscription.vipName} vence em ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"}. Renove pelo Discord para não perder os benefícios.`,
    "yellow"
  );

  subscription.warningDaysSent = Array.isArray(subscription.warningDaysSent) ? subscription.warningDaysSent : [];
  subscription.warningDaysSent.push(daysRemaining);
  subscription.updatedAt = new Date().toISOString();
}

async function checkVipSubscriptions() {
  const subscriptions = loadVipSubscriptions();
  const active = subscriptions.filter((sub) => sub.status === "active");

  if (!active.length) return;

  let changed = false;

  await withRcon(async (rcon) => {
    const onlinePlayers = parseOnlinePlayersFromList(await rcon.send("list"));

    for (const subscription of active) {
      const expiresAtMs = new Date(subscription.expiresAt).getTime();

      if (!Number.isFinite(expiresAtMs)) {
        subscription.status = "invalid";
        subscription.lastError = "expiresAt inválido";
        subscription.updatedAt = new Date().toISOString();
        changed = true;
        continue;
      }

      if (Date.now() >= expiresAtMs) {
        try {
          await expireVipSubscription(rcon, subscription, onlinePlayers);
          changed = true;
        } catch (error) {
          subscription.lastExpiryError = String(error?.message || error);
          subscription.updatedAt = new Date().toISOString();
          changed = true;
          console.error(`Erro ao remover VIP expirado de ${subscription.nick}:`, error.message || error);
        }
        continue;
      }

      const daysRemaining = subscriptionRemainingDay(subscription.expiresAt);
      subscription.warningDaysSent = Array.isArray(subscription.warningDaysSent) ? subscription.warningDaysSent : [];

      if (VIP_WARNING_DAYS.includes(daysRemaining) && !subscription.warningDaysSent.includes(daysRemaining)) {
        if (!isNickInOnlineList(onlinePlayers, subscription.nick)) {
          continue;
        }

        try {
          await warnVipSubscription(rcon, subscription, daysRemaining);
          changed = true;
        } catch (error) {
          subscription.lastWarningError = String(error?.message || error);
          subscription.updatedAt = new Date().toISOString();
          changed = true;
          console.warn(`Não consegui avisar ${subscription.nick} sobre vencimento VIP:`, error.message || error);
        }
      }
    }
  });

  if (changed) {
    saveVipSubscriptions(subscriptions);
  }
}

let vipExpiryMonitorStarted = false;

function startVipExpiryMonitor() {
  if (vipExpiryMonitorStarted) return;
  vipExpiryMonitorStarted = true;

  const intervalMs = VIP_EXPIRY_CHECK_INTERVAL_MINUTES * 60 * 1000;

  setTimeout(() => {
    checkVipSubscriptions().catch((error) => console.error("Erro na verificação de vencimento VIP:", error));
  }, 15 * 1000);

  setInterval(() => {
    checkVipSubscriptions().catch((error) => console.error("Erro na verificação de vencimento VIP:", error));
  }, intervalMs);

  console.log(`Verificador de vencimento VIP ativo a cada ${VIP_EXPIRY_CHECK_INTERVAL_MINUTES}min; duração padrão: ${VIP_DURATION_DAYS} dias`);
}

function buildVipActiveListText() {
  const active = loadVipSubscriptions()
    .filter((sub) => sub.status === "active")
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  if (!active.length) return "Nenhum VIP ativo registrado pelo bot.";

  return active.slice(0, 20).map((sub, index) => {
    return `${index + 1}. ${sub.nick} — ${sub.vipName} — vence em ${subscriptionRemainingDay(sub.expiresAt)} dia(s) — ${formatDateTimeBR(sub.expiresAt)}`;
  }).join("\n");
}

function generateCompraVipId() {
  return `vip_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAmount(value) {
  const clean = String(value || "").replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number(clean);
  if (!Number.isFinite(amount)) return 0;
  return Math.floor(amount * 100) / 100;
}

function formatMoney(amount) {
  return `R$${Number(amount).toFixed(2).replace(".", ",")}`;
}

function getVipByKey(key) {
  return vipRanges.find((vip) => vip.key === key) || null;
}

function getVipByAmount(amount) {
  return vipRanges.find((vip) => amount >= vip.min && amount <= vip.max) || null;
}

function isValidMinecraftNick(nick) {
  return /^[A-Za-z0-9_]{3,16}$/.test(nick);
}

function canManageVip(messageOrInteraction) {
  const member = messageOrInteraction.member;
  if (!member) return false;
  if (member.permissions?.has?.("Administrator") || member.permissions?.has?.("ManageGuild")) return true;
  if (VIP_STAFF_ROLE_ID && member.roles?.cache?.has?.(VIP_STAFF_ROLE_ID)) return true;
  return false;
}

const GENERAL_COMMANDS = new Set([
  "ping", "ip", "discord", "regras", "vip", "kits", "loja", "status", "online", "comandos", "ajuda"
]);

const RANK_COMMANDS = new Set(["rank"]);
const GIVEAWAY_COMMANDS = new Set(["evento", "sorteio", "participar"]);
const VIP_PANEL_COMMANDS = new Set(["comprarvip"]);
const TICKET_COMMANDS = new Set(["nick"]);
const STAFF_COMMANDS = new Set([
  "setevento", "removerevento", "criarsorteio", "sortear", "cancelarsorteio", "finalizarsorteio",
  "vipsetup", "painelvip", "vipconfig", "vipativos", "vipcheck"
]);

function getCommandName(content) {
  if (!String(content || "").startsWith(PREFIX)) return "";
  return String(content || "").slice(PREFIX.length).trim().split(/\s+/)[0]?.toLowerCase() || "";
}

function getCommandGroup(commandName) {
  if (STAFF_COMMANDS.has(commandName)) return "staff";
  if (RANK_COMMANDS.has(commandName)) return "rank";
  if (GIVEAWAY_COMMANDS.has(commandName)) return "giveaway";
  if (VIP_PANEL_COMMANDS.has(commandName)) return "vip_panel";
  if (TICKET_COMMANDS.has(commandName)) return "ticket";
  if (GENERAL_COMMANDS.has(commandName)) return "general";
  return "unknown";
}

function getChannelIdForCommandGroup(group) {
  if (group === "staff") return STAFF_COMMAND_CHANNEL_ID;
  if (group === "rank") return RANK_COMMAND_CHANNEL_ID;
  if (group === "giveaway") return GIVEAWAY_COMMAND_CHANNEL_ID;
  if (group === "vip_panel") return VIP_PANEL_CHANNEL_ID;
  if (group === "general") return GENERAL_COMMAND_CHANNEL_ID;
  return "";
}

function getChannelLabelForCommandGroup(group) {
  if (group === "staff") return "comandos da Staff";
  if (group === "rank") return "rankings";
  if (group === "giveaway") return "sorteios/eventos";
  if (group === "vip_panel") return "compra VIP";
  if (group === "general") return "comandos gerais";
  return "canal correto";
}

function formatDiscordChannel(channelId, fallbackText) {
  return channelId ? `<#${channelId}>` : fallbackText;
}

async function enforceCommandChannel(message, group, options = {}) {
  if (!group || group === "unknown") return true;

  if (group === "ticket") {
    if (options.isPrivateVipChannel) return true;
    await message.reply("⚠️ Use esse comando dentro do seu ticket privado de compra VIP.");
    return false;
  }

  const targetChannelId = getChannelIdForCommandGroup(group);
  if (!targetChannelId) return true;
  if (message.channel.id === targetChannelId) return true;

  const label = getChannelLabelForCommandGroup(group);
  await message.reply(`⚠️ Este comando deve ser usado no canal de **${label}**: ${formatDiscordChannel(targetChannelId, label)}.`);
  return false;
}

function createVipPanelEmbed() {
  return baseEmbed(
    "💎 Comprar VIP • ATM 11",
    [
      "Escolha abaixo a faixa de VIP que deseja comprar ou apoiar.",
      "",
      "Depois da escolha, o bot abre um **ticket privado de compra** e gera o **Pix / QR Code** automaticamente pelo Mercado Pago.",
      "",
      "**Faixas disponíveis:**",
      "⚒️ **VIP Ferro** — Doação de **R$5 a R$10**",
      "🟡 **VIP Ouro** — Doação de **R$11 a R$20**",
      "💎 **VIP Diamante** — Doação de **R$21 a R$30**",
      "🔥 **VIP Netherita** — Doação de **R$31 ou mais**",
      "",
      "💰 **Cada R$1 aprovado = 1 Ponto VIP.**",
      "🛒 Os Pontos VIP podem ser usados no jogo com `/loja`.",
      "⏰ Use `/recompensa` no jogo para ver sua próxima recompensa online.",
      `✅ O VIP fica ativo por **${VIP_DURATION_DAYS} dias** após a entrega.`,
      "✅ Após o pagamento aprovado, informe seu nick, entre no servidor e clique em **Receber VIP agora**.",
      "⚠️ O jogador precisa estar online para receber o VIP e os Pontos VIP.",
      "🗑️ Quando a compra terminar, o ticket poderá ser fechado pelo botão."
    ].join("\n"),
    0xff9900
  );
}

function createVipSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("vip_select_range")
    .setPlaceholder("Escolha sua faixa de VIP")
    .addOptions(vipRanges.map((vip) => ({
      label: `${vip.name} (${formatMoney(vip.min)}${vip.max >= 9999 ? "+" : ` a ${formatMoney(vip.max)}`})`,
      value: vip.key,
      description: `${vip.rewardText} • 1 real = 1 Ponto VIP`,
      emoji: vip.emoji
    })));
  return new ActionRowBuilder().addComponents(select);
}

function createVipAmountModal(vip) {
  const modal = new ModalBuilder()
    .setCustomId(`vip_amount_modal:${vip.key}`)
    .setTitle(`Comprar ${vip.name}`);
  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(vip.max >= 9999 ? `Valor em BRL, mínimo R$${vip.min}` : `Valor em BRL: R$${vip.min} a R$${vip.max}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(vip.max >= 9999 ? `${vip.min}` : `${vip.min}`)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);
  modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
  return modal;
}


function createVipTicketIntroEmbed(user, vip, amount) {
  return baseEmbed(
    `🧾 Ticket de compra • ${vip.name}`,
    [
      `Olá ${user}!`,
      "",
      "Seu ticket privado foi criado com sucesso.",
      "Toda a compra será feita por aqui, com confirmação automática.",
      "",
      "**Resumo da compra:**",
      `• VIP escolhido: **${vip.name}**`,
      `• Valor escolhido: **${formatMoney(amount)}**`,
      `• Pontos VIP: **${Math.floor(amount)}**`,
      `• Recompensa online: **${vip.rewardText}**`,
      `• Duração do VIP: **${VIP_DURATION_DAYS} dias**`,
      "",
      "⏳ Aguarde um instante enquanto gero o Pix / QR Code do Mercado Pago..."
    ].join("\n"),
    0xffb347
  );
}

function createVipPixGeneratedEmbed(vip, amount, qrCode) {
  return baseEmbed(
    "✅ Pix gerado com sucesso!",
    [
      "Seu pagamento foi criado e já está pronto para ser feito.",
      "",
      `**VIP:** ${vip.name}`,
      `**Valor:** ${formatMoney(amount)}`,
      `**Pontos VIP:** ${Math.floor(amount)}`,
      `**Duração do VIP:** ${VIP_DURATION_DAYS} dias`,
      "",
      "📷 Escaneie o QR Code abaixo ou use o Pix copia e cola.",
      "",
      qrCode ? `**Pix copia e cola:**\n\`\`\`\n${qrCode}\n\`\`\`` : "Pix copia e cola não retornou. Use o QR Code, se aparecer.",
      "",
      "Assim que o pagamento for aprovado, eu vou liberar a próxima etapa automaticamente."
    ].join("\n"),
    0x2ecc71
  );
}

function createVipApprovedEmbed(compra) {
  return baseEmbed(
    "💰 Pagamento aprovado!",
    [
      "Seu pagamento foi confirmado com sucesso.",
      "",
      `**VIP:** ${compra.vip.name}`,
      `**Valor pago:** ${formatMoney(compra.amount)}`,
      `**Pontos VIP:** ${compra.points}`,
      `**Duração do VIP:** ${VIP_DURATION_DAYS} dias após a entrega`,
      "",
      "⚠️ **Para receber o VIP, você precisa estar online no servidor Minecraft.**",
      "",
      "Agora informe seu nick exato usando o botão **Informar/editar nick** ou o comando:",
      `\`${PREFIX}nick SeuNick\``,
      "",
      "Depois clique em **Receber VIP agora**. Se você estiver offline, o bot vai manter o ticket aberto para você tentar novamente."
    ].join("\n"),
    0x57f287
  );
}

function createVipDeliveredEmbed(compra, nick) {
  return baseEmbed(
    "🎉 VIP entregue com sucesso!",
    [
      "Sua compra foi finalizada e o VIP já foi aplicado no servidor.",
      "",
      `**Nick:** ${nick}`,
      `**VIP:** ${compra.vip.name}`,
      `**Pontos VIP adicionados:** ${compra.points}`,
      `**Recompensa online:** ${compra.vip.rewardText}`,
      compra.vipExpiresAt ? `**VIP ativo até:** ${formatDateTimeBR(compra.vipExpiresAt)}` : `**Duração do VIP:** ${VIP_DURATION_DAYS} dias`,
      "",
      "Dentro do jogo, use `/loja` para gastar seus Pontos VIP e `/recompensa` para ver sua próxima recompensa online.",
      "",
      "Obrigado por apoiar o servidor! ❤️"
    ].join("\n"),
    0x3498db
  );
}


function createVipNeedsOnlineEmbed(compra, nick) {
  return baseEmbed(
    "⚠️ Entre no servidor para receber o VIP",
    [
      "Seu pagamento já está aprovado, mas o bot não encontrou esse nick puro online no servidor.",
      "",
      `**Nick informado:** ${nick}`,
      `**VIP:** ${compra.vip.name}`,
      `**Pontos VIP:** ${compra.points}`,
      "",
      "Entre no servidor com exatamente esse nick e clique em **Tentar receber novamente**.",
      "Se o nick estiver errado, clique em **Editar nick** e corrija.",
      "",
      "Este ticket continuará aberto enquanto o VIP estiver aguardando entrega."
    ].join("\n"),
    0xfee75c
  );
}

function createVipNickSavedEmbed(compra) {
  return baseEmbed(
    "✅ Nick salvo",
    [
      `Nick configurado: **${compra.minecraftNick}**`,
      "",
      "Agora entre no servidor com esse nick e clique em **Receber VIP agora**.",
      "O bot vai verificar somente o nick puro, sem prefixo/tag do chat, antes de aplicar o VIP."
    ].join("\n"),
    0x57f287
  );
}

function createVipTicketExpiredEmbed(compra) {
  return baseEmbed(
    "⏰ Ticket expirado",
    [
      "Este ticket ficou 10 minutos sem pagamento aprovado e será fechado automaticamente.",
      "",
      "Nenhum VIP foi aplicado e nenhum Ponto VIP foi adicionado por este ticket.",
      "Se quiser comprar depois, abra uma nova compra no painel VIP."
    ].join("\n"),
    0xed4245
  );
}

function createVipDeliveryActionRow(compraId, retry = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vip_receive_now:${compraId}`)
      .setLabel(retry ? "Tentar receber novamente" : "Receber VIP agora")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🎁"),
    new ButtonBuilder()
      .setCustomId(`vip_edit_nick:${compraId}`)
      .setLabel("Informar/editar nick")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️")
  );
}

function createVipNickModal(compra) {
  const modal = new ModalBuilder()
    .setCustomId(`vip_nick_modal:${compra.id}`)
    .setTitle("Informar nick do Minecraft");

  const nickInput = new TextInputBuilder()
    .setCustomId("minecraft_nick")
    .setLabel("Nick exato do Minecraft")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Exemplo: AndersonAriel")
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(16);

  // Discord não aceita setValue("") em modal.
  // Se ainda não existe nick salvo, o campo abre vazio para o player preencher.
  if (compra.minecraftNick) {
    nickInput.setValue(compra.minecraftNick);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(nickInput));
  return modal;
}

function findCompraVipById(compraId) {
  return loadComprasVip().find((item) => item.id === compraId) || null;
}

function canUseVipTicketAction(interaction, compra) {
  return interaction.user.id === compra.discordUserId || canManageVip(interaction);
}

function saveCompraNick(compra, nick) {
  compra.minecraftNick = nick;
  compra.status = "nick_informado";
  compra.updatedAt = new Date().toISOString();
  updateCompraVip(compra);
  return compra;
}

async function handleVipNickModalSubmit(interaction, compraId) {
  const compra = findCompraVipById(compraId);

  if (!compra) {
    await interaction.reply({ content: "⚠️ Não encontrei a compra vinculada a este ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canUseVipTicketAction(interaction, compra)) {
    await interaction.reply({ content: "❌ Você não tem permissão para editar este nick.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (compra.status === "vip_entregue") {
    await interaction.reply({ content: "⚠️ Esse VIP já foi entregue.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!VIP_DELIVERY_PENDING_STATUSES.has(compra.status)) {
    await interaction.reply({ content: "⚠️ O pagamento ainda não está aprovado para informar o nick.", flags: MessageFlags.Ephemeral });
    return;
  }

  const nick = interaction.fields.getTextInputValue("minecraft_nick").trim();

  if (!isValidMinecraftNick(nick)) {
    await interaction.reply({ content: "❌ Nick inválido. Use exatamente o nick do Minecraft, com 3 a 16 caracteres, somente letras, números e underline.", flags: MessageFlags.Ephemeral });
    return;
  }

  saveCompraNick(compra, nick);

  await interaction.reply({
    embeds: [createVipNickSavedEmbed(compra)],
    components: [createVipDeliveryActionRow(compra.id)]
  });
}

async function handleReceiveVipNowInteraction(interaction, compraId) {
  const compra = findCompraVipById(compraId);

  if (!compra) {
    await interaction.reply({ content: "⚠️ Não encontrei a compra vinculada a este ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canUseVipTicketAction(interaction, compra)) {
    await interaction.reply({ content: "❌ Você não tem permissão para receber este VIP.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (compra.status === "vip_entregue") {
    await interaction.reply({ content: "✅ Esse VIP já foi entregue.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!VIP_DELIVERY_PENDING_STATUSES.has(compra.status)) {
    await interaction.reply({ content: "⚠️ O pagamento ainda não está aprovado para entregar o VIP.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!compra.minecraftNick) {
    await interaction.reply({
      content: "⚠️ Primeiro informe seu nick pelo botão **Informar/editar nick** ou usando `!nick SeuNick` neste ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  compra.status = "aplicando_vip";
  compra.updatedAt = new Date().toISOString();
  updateCompraVip(compra);

  await interaction.deferReply();
  await interaction.editReply({ embeds: [baseEmbed("⏳ Verificando servidor", `Estou verificando se **${compra.minecraftNick}** está online e aplicando o VIP.`, 0xfee75c)] });

  try {
    const delivery = await applyVipToMinecraft(compra, compra.minecraftNick);
    compra.status = "vip_entregue";
    compra.vipStartedAt = delivery.subscription.startedAt || new Date().toISOString();
    compra.vipExpiresAt = delivery.subscription.expiresAt;
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);

    await interaction.editReply({ embeds: [createVipDeliveredEmbed(compra, compra.minecraftNick)], components: [] });

    const channel = await client.channels.fetch(compra.channelId).catch(() => null);
    if (channel) await offerCloseTicket(channel, compra, "success");

    await notifyVipLog(compra, `🎉 VIP entregue: ${compra.minecraftNick} | ${compra.vip.name} | ${formatMoney(compra.amount)} | ${compra.points} pontos | expira em ${formatDateTimeBR(compra.vipExpiresAt)}`);
  } catch (error) {
    if (error?.code === "PLAYER_OFFLINE_FOR_VIP_DELIVERY") {
      compra.status = "aguardando_entrega";
      compra.updatedAt = new Date().toISOString();
      updateCompraVip(compra);

      await interaction.editReply({
        embeds: [createVipNeedsOnlineEmbed(compra, compra.minecraftNick)],
        components: [createVipDeliveryActionRow(compra.id, true)]
      });

      await notifyVipLog(compra, `⚠️ VIP aguardando jogador online: ${compra.minecraftNick} | ${compra.vip.name} | ${formatMoney(compra.amount)} | ${compra.points} pontos`);
      return;
    }

    compra.status = "erro_entrega";
    compra.lastDeliveryError = String(error?.message || error);
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);

    console.error("Erro ao entregar VIP:", error);
    await interaction.editReply({
      content: "❌ Pagamento aprovado, mas houve erro ao aplicar o VIP via RCON. Avise a Staff.",
      components: [createVipDeliveryActionRow(compra.id)]
    });
  }
}

function createVipErrorEmbed(title, lines) {
  return baseEmbed(title, lines.join("\n"), 0xed4245);
}

function createCloseTicketRow(compraId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vip_close_ticket:${compraId}`)
      .setLabel("Fechar ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
  );
}

async function safeDeleteMessage(message) {
  if (!message || !message.deletable) return;
  try { await message.delete(); } catch {}
}

async function offerCloseTicket(channel, compra, reason = "manual") {
  if (!channel || !compra) return;

  const compras = loadComprasVip();
  const current = compras.find((item) => item.id === compra.id) || compra;

  if (current.closeButtonSent) return;

  current.closeButtonSent = true;
  current.closeButtonSentAt = new Date().toISOString();
  current.updatedAt = new Date().toISOString();
  updateCompraVip(current);

  let description;

  if (reason === "success") {
    description = [
      "Sua compra foi concluída com sucesso.",
      "Se já terminou tudo, você pode fechar este ticket pelo botão abaixo."
    ].join("\n");
  } else {
    description = [
      "Este ticket já está aberto há alguns minutos.",
      "Se você não for continuar a compra agora, pode fechá-lo pelo botão abaixo.",
      "Se quiser continuar depois, basta abrir uma nova compra no painel VIP."
    ].join("\n");
  }

  await channel.send({
    embeds: [baseEmbed("🗑️ Fechar ticket", description, 0xed4245)],
    components: [createCloseTicketRow(current.id)]
  }).catch(() => {});
}

async function scheduleCloseTicketOffer(channel, compra, delayMs = VIP_TICKET_AUTO_CLOSE_MINUTES * 60 * 1000) {
  setTimeout(async () => {
    try {
      const compras = loadComprasVip();
      const current = compras.find((item) => item.id === compra.id);
      if (!current) return;
      if (["vip_entregue", "ticket_fechado", "ticket_expirado_sem_pagamento"].includes(current.status)) return;

      // Só fecha automaticamente ticket sem pagamento aprovado.
      // Se o pagamento foi aprovado e o player está aguardando entrega, o ticket fica aberto.
      if (!VIP_UNPAID_STATUSES.has(current.status)) return;

      current.status = "ticket_expirado_sem_pagamento";
      current.closedAt = new Date().toISOString();
      current.updatedAt = new Date().toISOString();
      updateCompraVip(current);

      await channel.send({ embeds: [createVipTicketExpiredEmbed(current)] }).catch(() => {});
      await notifyVipLog(current, `⏰ Ticket expirado sem pagamento aprovado: ${current.discordTag} | ${current.vip.name} | ${formatMoney(current.amount)}`);

      setTimeout(async () => {
        try {
          await channel.delete("Ticket VIP expirado sem pagamento aprovado");
        } catch (error) {
          console.error("Erro ao fechar ticket VIP expirado:", error);
        }
      }, 5000);
    } catch (error) {
      console.error("Erro ao agendar fechamento automático de ticket VIP:", error);
    }
  }, delayMs);
}

async function handleCloseTicketInteraction(interaction, compraId) {
  const compras = loadComprasVip();
  const compra = compras.find((item) => item.id === compraId);

  if (!compra) {
    await interaction.reply({ content: "⚠️ Não encontrei a compra vinculada a este ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  const isOwner = interaction.user.id === compra.discordUserId;
  const isStaff = canManageVip(interaction);

  if (!isOwner && !isStaff) {
    await interaction.reply({ content: "❌ Você não tem permissão para fechar este ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isStaff && compra.status !== "vip_entregue") {
    await interaction.reply({
      content: "⚠️ Este ticket ainda está em processo de entrega. Ele só pode ser fechado pelo player depois que o VIP for entregue com sucesso.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  compra.status = "ticket_fechado";
  compra.closedAt = new Date().toISOString();
  compra.updatedAt = new Date().toISOString();
  updateCompraVip(compra);

  await notifyVipLog(compra, `🗑️ Ticket fechado: ${compra.discordTag} | ${compra.vip.name} | status final: ${compra.paymentStatus || compra.status}`);

  await interaction.reply({ content: "🗑️ Fechando ticket...", flags: MessageFlags.Ephemeral }).catch(() => {});
  setTimeout(async () => {
    try {
      await interaction.channel.delete("Ticket de compra VIP finalizado");
    } catch (error) {
      console.error("Erro ao fechar ticket VIP:", error);
    }
  }, 1500);
}

async function createPrivateVipChannel(interaction, vip, amount) {
  const guild = interaction.guild;
  if (!guild) throw new Error("Este comando precisa ser usado dentro do servidor Discord.");
  const channelName = `ticket-compra-${interaction.user.username}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
  const options = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
      ...(VIP_STAFF_ROLE_ID ? [{ id: VIP_STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : [])
    ]
  };
  if (VIP_CATEGORY_ID) options.parent = VIP_CATEGORY_ID;
  return await guild.channels.create(options);
}


function getMercadoPagoPayerEmail(discordUserId) {
  const configuredEmail = String(process.env.MP_PAYER_EMAIL || "").trim();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail)) {
    return configuredEmail;
  }

  // Mercado Pago rejeita domínios locais como atm11.local.
  // Este e-mail é apenas para preencher o campo obrigatório do payer.
  return `comprador.${discordUserId}@gmail.com`;
}


function getMercadoPagoNotificationUrl() {
  let rawUrl = String(PUBLIC_URL || "").trim();

  if (!rawUrl) {
    return null;
  }

  // Se a pessoa colocou só bot-production-xxxx.up.railway.app,
  // o bot corrige automaticamente para https://bot-production-xxxx.up.railway.app
  if (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://")) {
    rawUrl = `https://${rawUrl}`;
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
      return null;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".internal") ||
      hostname.includes("railway.internal")
    ) {
      return null;
    }

    return `${url.origin}/webhook/mercadopago`;
  } catch {
    return null;
  }
}

async function createMercadoPagoPixPayment({ amount, description, discordUserId, compraId }) {
  if (!MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado nas Variables do Railway.");
  const payload = {
    transaction_amount: amount,
    description,
    payment_method_id: "pix",
    external_reference: compraId,
    metadata: { compra_id: compraId, discord_user_id: discordUserId },
    payer: { email: getMercadoPagoPayerEmail(discordUserId), first_name: "Jogador", last_name: "ATM11" }
  };
  if (PUBLIC_URL) payload.notification_url = `${PUBLIC_URL}/webhook/mercadopago`;
  const notificationUrl = getMercadoPagoNotificationUrl();

  if (notificationUrl) {
    payload.notification_url = notificationUrl;
  } else if (PUBLIC_URL) {
    console.warn(`PUBLIC_URL inválida para webhook Mercado Pago: ${PUBLIC_URL}`);
  }

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": compraId },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Mercado Pago erro: ${JSON.stringify(data)}`);
  return data;
}

async function getMercadoPagoPayment(paymentId) {
  if (!MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado.");
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Erro ao consultar pagamento Mercado Pago: ${JSON.stringify(data)}`);
  return data;
}

function paymentQrAttachment(paymentData) {
  const base64 = paymentData?.point_of_interaction?.transaction_data?.qr_code_base64;
  if (!base64) return null;
  return new AttachmentBuilder(Buffer.from(base64, "base64"), { name: "pix-qrcode.png" });
}

function getPixCopiaCola(paymentData) {
  return paymentData?.point_of_interaction?.transaction_data?.qr_code || "";
}

async function notifyVipLog(compra, text) {
  if (!VIP_LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(VIP_LOG_CHANNEL_ID);
    if (channel) await channel.send(text);
  } catch (error) {
    console.error("Erro ao enviar log VIP:", error);
  }
}

async function sendPurchaseApprovedMessage(compra) {
  try {
    const channel = await client.channels.fetch(compra.channelId);
    if (!channel) return;
    await channel.send({ embeds: [createVipApprovedEmbed(compra)], components: [createVipDeliveryActionRow(compra.id)] });
  } catch (error) {
    console.error("Erro ao enviar mensagem de pagamento aprovado:", error);
  }
}

async function processMercadoPagoPayment(paymentId) {
  const paymentData = await getMercadoPagoPayment(paymentId);
  const status = paymentData.status;
  const compraId = paymentData.external_reference || paymentData.metadata?.compra_id;
  if (!compraId) { console.warn("Pagamento Mercado Pago sem external_reference:", paymentId); return; }
  const compras = loadComprasVip();
  const compra = compras.find((item) => item.id === compraId);
  if (!compra) { console.warn("Compra VIP não encontrada:", paymentId, compraId); return; }
  const amountPaid = Number(paymentData.transaction_amount || compra.amount);
  const detectedVip = getVipByAmount(amountPaid);
  compra.paymentId = String(paymentData.id || paymentId);
  compra.paymentStatus = status;
  compra.amount = amountPaid;
  compra.points = Math.floor(amountPaid);
  compra.updatedAt = new Date().toISOString();
  if (detectedVip) compra.vip = detectedVip;
  if (status === "approved" && compra.status === "aguardando_pagamento") {
    compra.status = "pagamento_aprovado";
    updateCompraVip(compra);
    await sendPurchaseApprovedMessage(compra);
    await notifyVipLog(compra, `✅ Pagamento aprovado: ${compra.discordTag} | ${compra.vip.name} | ${formatMoney(compra.amount)} | ${compra.points} pontos`);
    return;
  }
  updateCompraVip(compra);
}

async function applyVipToMinecraft(compra, nick) {
  const points = Math.floor(Number(compra.amount));
  const vip = compra.vip;
  return await withRcon(async (rcon) => {
    const online = await isPlayerOnlineByList(rcon, nick);
    if (!online) {
      const error = new Error(`Jogador ${nick} não está online para receber VIP.`);
      error.code = "PLAYER_OFFLINE_FOR_VIP_DELIVERY";
      throw error;
    }

    // Remove somente ranks VIP antigos para evitar acumular VIP Ferro/Ouro/Diamante/Netherita no mesmo player.
    // Não mexe em rank de Staff/Admin, porque esses ranks não estão na lista vipRanges.
    for (const rank of getVipRankList().filter((rank) => rank !== vip.rank)) {
      await rcon.send(`ftbranks remove ${nick} ${rank}`).catch(() => {});
    }

    const commands = [
      // FTB Ranks já controla o rank, prefixo, permissões, tags/nodes e recompensa online.
      `ftbranks add ${nick} ${vip.rank}`,
      // Pontos VIP pelo comando oficial do sistema novo da loja.
      `darpontosvip ${nick} ${points}`,
      `tellraw @a [{"text":"✦ ","color":"gold","bold":true},{"text":"${nick}","color":"yellow","bold":true},{"text":" é o mais novo ${vip.name} do servidor! Recebeu ${points} Pontos VIP. Obrigado pelo apoio!","color":"green"}]`
    ];
    const results = [];
    for (const command of commands) {
      const result = await rcon.send(command);
      results.push({ command, result });
    }

    const subscription = upsertVipSubscription({ ...compra, points }, nick);
    results.push({ command: "vip_subscription", result: subscription.expiresAt });
    return { results, subscription };
  });
}
async function startVipPurchaseFromModal(interaction, vip, amount) {
  const detectedVip = getVipByAmount(amount);
  if (!detectedVip || detectedVip.key !== vip.key) {
    await interaction.reply({ content: `❌ Valor inválido para ${vip.name}. Use ${vip.max >= 9999 ? `R$${vip.min} ou mais` : `entre R$${vip.min} e R$${vip.max}`}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await createPrivateVipChannel(interaction, vip, amount);
  const compraId = generateCompraVipId();
  const compra = {
    id: compraId,
    discordUserId: interaction.user.id,
    discordTag: interaction.user.tag,
    channelId: channel.id,
    amount,
    points: Math.floor(amount),
    vip,
    status: "criando_pagamento",
    paymentStatus: "pending",
    paymentId: null,
    minecraftNick: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  updateCompraVip(compra);
  await interaction.editReply(`✅ Criei seu ticket de compra VIP: ${channel}`);
  await channel.send({ embeds: [createVipTicketIntroEmbed(interaction.user, vip, amount)] });
  await scheduleCloseTicketOffer(channel, compra);
  try {
    const paymentData = await createMercadoPagoPixPayment({
      amount,
      description: `${vip.name} ATM 11 - ${interaction.user.tag}`,
      discordUserId: interaction.user.id,
      compraId
    });
    compra.status = "aguardando_pagamento";
    compra.paymentId = String(paymentData.id);
    compra.paymentStatus = paymentData.status;
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);
    const qrCode = getPixCopiaCola(paymentData);
    const attachment = paymentQrAttachment(paymentData);
    const paymentMessage = [
      "✅ **Pix gerado com sucesso!**",
      "",
      `VIP: **${vip.name}**`,
      `Valor: **${formatMoney(amount)}**`,
      `Pontos VIP: **${Math.floor(amount)}**`,
      "",
      "Pague usando o QR Code abaixo ou o Pix copia e cola.",
      "",
      qrCode ? `**Pix copia e cola:**\n\`\`\`\n${qrCode}\n\`\`\`` : "Pix copia e cola não retornou. Use o QR Code, se aparecer.",
      "",
      "Assim que o pagamento for aprovado, o bot vai pedir seu nick do Minecraft automaticamente."
    ].join("\n");
    if (attachment) await channel.send({ content: paymentMessage, files: [attachment] });
    else await channel.send(paymentMessage);
  } catch (error) {
    console.error("Erro ao gerar Pix Mercado Pago:", error);
    compra.status = "erro_pagamento";
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);
    await channel.send({
      embeds: [createVipErrorEmbed("❌ Não consegui gerar o Pix agora.", [
        "O Mercado Pago recusou a criação do pagamento ou alguma configuração ainda está incorreta.",
        "",
        "**O que fazer:**",
        "• Você não foi cobrado por essa tentativa.",
        "• Avise a Staff para verificar o painel do Mercado Pago e as variáveis do Railway.",
        "• Depois que a Staff corrigir, tente comprar novamente.",
        "",
        "**Possíveis causas:**",
        "• MP_ACCESS_TOKEN inválido ou de teste no lugar de produção.",
        "• Conta Mercado Pago sem chave Pix ou sem liberação para receber Pix.",
        "• PUBLIC_URL sem https:// ou usando domínio privado.",
        "• E-mail do pagador inválido.",
        "• Produto integrado da aplicação configurado de forma incorreta."
      ])]
    });
  }
}

async function setNickForApprovedVipPurchase(message, nick) {
  if (!isValidMinecraftNick(nick)) {
    await message.reply("❌ Nick inválido. Use exatamente o nick do Minecraft, com 3 a 16 caracteres, somente letras, números e underline.");
    return;
  }

  const compras = loadComprasVip();
  const compra = compras
    .filter((item) => item.discordUserId === message.author.id && item.channelId === message.channel.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (!compra) {
    await message.reply("❌ Não encontrei uma compra VIP sua nesta sala.");
    return;
  }

  if (compra.status === "vip_entregue") {
    await message.reply("✅ Esta compra já foi entregue com sucesso.");
    return;
  }

  if (!VIP_DELIVERY_PENDING_STATUSES.has(compra.status)) {
    await message.reply("⚠️ Seu pagamento ainda não foi aprovado. Aguarde a confirmação automática do Mercado Pago.");
    return;
  }

  saveCompraNick(compra, nick);

  await message.reply({
    embeds: [createVipNickSavedEmbed(compra)],
    components: [createVipDeliveryActionRow(compra.id)]
  });
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", () => {
  startMercadoPagoPolling();
  startVipExpiryMonitor();
  console.log(`Bot online como ${client.user.tag}`);
  client.user.setActivity("ATM 11 | !loja • !vip");

  if (!MP_ACCESS_TOKEN) {
    console.warn("AVISO: MP_ACCESS_TOKEN não configurado. O painel VIP abre, mas não conseguirá gerar Pix.");
  }

  if (!PUBLIC_URL) {
    console.warn("AVISO: PUBLIC_URL não configurada. O Mercado Pago não conseguirá avisar pagamento aprovado por webhook.");
  }
});



let mercadoPagoPollingStarted = false;

async function checkPendingMercadoPagoPayments() {
  const compras = loadComprasVip();
  const pending = compras.filter((compra) =>
    compra.paymentId &&
    compra.status === "aguardando_pagamento"
  );

  if (!pending.length) {
    return;
  }

  for (const compra of pending) {
    try {
      await processMercadoPagoPayment(compra.paymentId);
    } catch (error) {
      console.error(`Erro ao verificar pagamento pendente ${compra.paymentId}:`, error.message || error);
    }
  }
}

function startMercadoPagoPolling() {
  if (mercadoPagoPollingStarted) return;
  mercadoPagoPollingStarted = true;

  const intervalMs = Math.max(10, MP_POLL_INTERVAL_SECONDS) * 1000;

  setInterval(() => {
    checkPendingMercadoPagoPayments().catch((error) => {
      console.error("Erro no verificador automático do Mercado Pago:", error);
    });
  }, intervalMs);

  console.log(`Verificador automático Mercado Pago ativo a cada ${Math.round(intervalMs / 1000)}s`);
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "vip_select_range") {
      const vip = getVipByKey(interaction.values[0]);

      if (!vip) {
        await interaction.reply({ content: "❌ VIP inválido.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.showModal(createVipAmountModal(vip));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("vip_amount_modal:")) {
      const vipKey = interaction.customId.split(":")[1];
      const vip = getVipByKey(vipKey);

      if (!vip) {
        await interaction.reply({ content: "❌ VIP inválido.", flags: MessageFlags.Ephemeral });
        return;
      }

      const amount = normalizeAmount(interaction.fields.getTextInputValue("amount"));
      await startVipPurchaseFromModal(interaction, vip, amount);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("vip_receive_now:")) {
      const compraId = interaction.customId.split(":")[1];
      await handleReceiveVipNowInteraction(interaction, compraId);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("vip_edit_nick:")) {
      const compraId = interaction.customId.split(":")[1];
      const compra = findCompraVipById(compraId);

      if (!compra) {
        await interaction.reply({ content: "⚠️ Não encontrei a compra vinculada a este ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (!canUseVipTicketAction(interaction, compra)) {
        await interaction.reply({ content: "❌ Você não tem permissão para editar este nick.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.showModal(createVipNickModal(compra));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("vip_nick_modal:")) {
      const compraId = interaction.customId.split(":")[1];
      await handleVipNickModalSubmit(interaction, compraId);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("vip_close_ticket:")) {
      const compraId = interaction.customId.split(":")[1];
      await handleCloseTicketInteraction(interaction, compraId);
      return;
    }
  } catch (error) {
    console.error("Erro em interactionCreate VIP:", error);

    if (interaction.isRepliable()) {
      const content = "❌ Ocorreu um erro ao processar essa ação. Avise a Staff.";

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(content).catch(() => {});
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  if (!content.startsWith(PREFIX)) return;

  const commandName = getCommandName(content);
  const commandGroup = getCommandGroup(commandName);
  const isPrivateVipChannel = message.channel.name?.startsWith("ticket-compra-");

  if (!(await enforceCommandChannel(message, commandGroup, { isPrivateVipChannel }))) return;

  if (content === `${PREFIX}ping`) {
    await message.reply("🏓 Pong!");
    return;
  }

  if (content === `${PREFIX}ip`) {
    await message.reply({ embeds: [buildIpEmbed()] });
    return;
  }

  if (content === `${PREFIX}discord`) {
    await message.reply({ embeds: [buildDiscordEmbed()] });
    return;
  }

  if (content === `${PREFIX}regras`) {
    await message.reply({ embeds: [buildRegrasEmbed()] });
    return;
  }

  if (content === `${PREFIX}vip`) {
    await message.reply({ embeds: [buildVipEmbed()] });
    return;
  }

  if (content === `${PREFIX}kits`) {
    await message.reply({ embeds: [buildKitsEmbed()] });
    return;
  }

  if (content === `${PREFIX}loja`) {
    await message.reply({ embeds: [buildLojaEmbed()] });
    return;
  }

  if (content === `${PREFIX}evento`) {
    await message.reply({ embeds: [buildEventoEmbed()] });
    return;
  }

  if (content.startsWith(`${PREFIX}setevento`)) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para alterar o evento. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const rawEvento = content.slice(`${PREFIX}setevento`.length).trim();
    const evento = parseSetEvento(rawEvento);

    if (!evento) {
      await message.reply([
        "❌ Formato incorreto.",
        "",
        "Use assim:",
        `\`${PREFIX}setevento Título | Data | Prêmio | Texto do evento\``,
        "",
        "Exemplo:",
        `\`${PREFIX}setevento 🎉 Evento valendo VIP | Sábado 20h | VIP Ferro | Corrida no spawn valendo VIP para o vencedor\``
      ].join("\n"));
      return;
    }

    saveEvento(evento);
    await message.reply({ content: "✅ Evento atualizado com sucesso!", embeds: [buildEventoEmbed()] });
    await safeDeleteMessage(message);
    return;
  }

  if (content === `${PREFIX}removerevento`) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para remover o evento. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const evento = loadEvento();

    if (!evento.ativo) {
      await message.reply("⚠️ Não existe evento ativo para remover.");
      return;
    }

    evento.ativo = false;
    saveEvento(evento);
    await message.reply({ content: "✅ Evento removido com sucesso.", embeds: [buildEventoEmbed()] });
    await safeDeleteMessage(message);
    return;
  }

  if (content === `${PREFIX}status`) {
    const loading = await message.reply("🔎 Consultando status do servidor...");
    try {
      const embed = await buildStatusEmbed();
      await loading.edit({ content: "", embeds: [embed] });
    } catch (error) {
      console.error(error);
      await loading.edit("❌ Não consegui consultar o servidor. Confira RCON_HOST, RCON_PORT e RCON_PASSWORD no Railway.");
    }
    return;
  }

  if (content === `${PREFIX}online`) {
    const loading = await message.reply("🔎 Consultando jogadores online...");
    try {
      const embed = await buildOnlineEmbed();
      await loading.edit({ content: "", embeds: [embed] });
    } catch (error) {
      console.error(error);
      await loading.edit("❌ Não consegui consultar os jogadores online. Confira se o RCON está ativo.");
    }
    return;
  }

  if (content === `${PREFIX}comandos` || content === `${PREFIX}ajuda`) {
    await message.reply({ embeds: [buildComandosEmbed()] });
    return;
  }

  if (content === `${PREFIX}sorteio`) {
    await message.reply({ embeds: [buildSorteioEmbed()] });
    return;
  }

  if (content.startsWith(`${PREFIX}criarsorteio`)) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para criar sorteio. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const rawSorteio = content.slice(`${PREFIX}criarsorteio`.length).trim();
    const sorteio = parseCriarSorteio(rawSorteio);

    if (!sorteio) {
      await message.reply([
        "❌ Formato incorreto.",
        "",
        "Use assim:",
        `\`${PREFIX}criarsorteio Título | Prêmio | Data | Texto do sorteio\``,
        "",
        "Exemplo:",
        `\`${PREFIX}criarsorteio 🎁 Sorteio valendo VIP | VIP Ferro | Domingo 20h | Clique em participar para concorrer ao VIP\``
      ].join("\n"));
      return;
    }

    saveSorteio(sorteio);
    await message.reply({ content: "✅ Sorteio criado com sucesso!", embeds: [buildSorteioEmbed()] });
    await safeDeleteMessage(message);
    return;
  }

  if (content === `${PREFIX}participar`) {
    const result = addParticipante(message);
    await message.reply(result.message);
    return;
  }

  if (content === `${PREFIX}sortear`) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para sortear. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const result = pickWinner();

    if (!result.ok) {
      await message.reply(result.message);
      return;
    }

    const lines = [
      "🎉 **VENCEDOR SORTEADO!** 🎉",
      "",
      `🏆 Vencedor: <@${result.winnerId}>`,
      `🎁 Prêmio: **${result.premio}**`,
      `👥 Participantes no sorteio: **${result.participantes}**`,
      `🔁 Restantes para possível novo sorteio: **${result.restantes}**`,
      "",
      "Parabéns ao vencedor! 🚀"
    ];

    if (result.aindaAtivo) {
      lines.push("");
      lines.push("Caso o vencedor não faça mais parte do servidor ou não possa receber o prêmio, a Staff pode usar `!sortear` novamente.");
    } else {
      lines.push("");
      lines.push("Não há mais participantes restantes. O sorteio foi encerrado automaticamente.");
    }

    await message.reply(lines.join("\n"));
    return;
  }

  if (content === `${PREFIX}cancelarsorteio`) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para cancelar sorteio. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const sorteio = loadSorteio();

    if (!sorteio.ativo) {
      await message.reply("⚠️ Não existe sorteio ativo para cancelar.");
      return;
    }

    sorteio.ativo = false;
    saveSorteio(sorteio);
    await message.reply("✅ Sorteio cancelado com sucesso.");
    await safeDeleteMessage(message);
    return;
  }

  if (content === `${PREFIX}finalizarsorteio`) {
    if (!hasEventPermission(message)) {
      await message.reply("❌ Você não tem permissão para finalizar sorteio. Permissão necessária: **Gerenciar Servidor**.");
      return;
    }

    const sorteio = loadSorteio();

    if (!sorteio.ativo) {
      await message.reply("⚠️ Não existe sorteio ativo para finalizar.");
      return;
    }

    sorteio.ativo = false;
    saveSorteio(sorteio);

    await message.reply([
      "✅ **Sorteio finalizado com sucesso.**",
      "",
      "Agora a Staff já pode criar outro sorteio usando:",
      `\`${PREFIX}criarsorteio Título | Prêmio | Data | Texto do sorteio\``
    ].join("\n"));
    return;
  }

  if (content === `${PREFIX}vipsetup` || content === `${PREFIX}painelvip`) {
    if (!canManageVip(message)) {
      await message.reply("❌ Você não tem permissão para criar o painel VIP.");
      return;
    }

    let targetChannel = message.channel;
    if (VIP_PANEL_CHANNEL_ID) {
      try {
        targetChannel = await client.channels.fetch(VIP_PANEL_CHANNEL_ID);
      } catch (error) {
        console.error("Erro ao buscar VIP_PANEL_CHANNEL_ID:", error);
        await message.reply("❌ Não consegui encontrar o canal configurado em VIP_PANEL_CHANNEL_ID.");
        return;
      }
    }

    if (!targetChannel?.send) {
      await message.reply("❌ O canal do painel VIP não permite envio de mensagens pelo bot.");
      return;
    }

    await targetChannel.send({ embeds: [createVipPanelEmbed()], components: [createVipSelectRow()] });
    await message.reply(`✅ Painel VIP criado com sucesso em ${formatDiscordChannel(targetChannel.id, "canal VIP")}.`);
    await safeDeleteMessage(message);
    return;
  }

  if (content === `${PREFIX}comprarvip`) {
    if (VIP_PANEL_CHANNEL_ID && message.channel.id !== VIP_PANEL_CHANNEL_ID) {
      await message.reply("⚠️ Use este comando somente no canal de compra VIP configurado.");
      return;
    }
    await message.reply({ embeds: [createVipPanelEmbed()], components: [createVipSelectRow()] });
    return;
  }

  if (content.startsWith(`${PREFIX}nick `)) {
    const nick = content.slice(`${PREFIX}nick`.length).trim();
    await setNickForApprovedVipPurchase(message, nick);
    return;
  }

  if (content === `${PREFIX}vipativos`) {
    if (!canManageVip(message)) {
      await message.reply("❌ Você não tem permissão para ver os VIPs ativos.");
      return;
    }

    await message.reply([
      "📅 **VIPs ativos registrados pelo bot**",
      "",
      buildVipActiveListText()
    ].join("\n"));
    return;
  }

  if (content === `${PREFIX}vipcheck`) {
    if (!canManageVip(message)) {
      await message.reply("❌ Você não tem permissão para verificar vencimentos VIP.");
      return;
    }

    await message.reply("🔎 Verificando avisos e vencimentos VIP agora...");
    try {
      await checkVipSubscriptions();
      await message.reply("✅ Verificação de VIP concluída.");
    } catch (error) {
      console.error("Erro no vipcheck:", error);
      await message.reply("❌ Erro ao verificar vencimentos VIP. Veja o log do bot.");
    }
    return;
  }

  if (content === `${PREFIX}vipconfig`) {
    if (!canManageVip(message)) {
      await message.reply("❌ Você não tem permissão para ver a configuração VIP.");
      return;
    }

    const notificationUrl = getMercadoPagoNotificationUrl();

    await message.reply([
      "🔎 **Configuração do sistema VIP**",
      "",
      `MP_ACCESS_TOKEN: ${MP_ACCESS_TOKEN ? "✅ configurado" : "❌ faltando"}`,
      `PUBLIC_URL: ${PUBLIC_URL ? `\`${PUBLIC_URL}\`` : "❌ faltando"}`,
      `Webhook usado pelo bot: ${notificationUrl ? `\`${notificationUrl}\`` : "⚠️ inválido ou desativado"}`,
      `${PUBLIC_URL && !String(PUBLIC_URL).startsWith("https://") && !String(PUBLIC_URL).startsWith("http://") ? "ℹ️ PUBLIC_URL corrigida automaticamente com https://" : ""}`,
      `MP_PAYER_EMAIL: ${process.env.MP_PAYER_EMAIL ? "✅ configurado" : "⚠️ usando e-mail técnico automático"}`,
      `GENERAL_COMMAND_CHANNEL_ID: ${GENERAL_COMMAND_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `RANK_COMMAND_CHANNEL_ID: ${RANK_COMMAND_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `GIVEAWAY_COMMAND_CHANNEL_ID: ${GIVEAWAY_COMMAND_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `STAFF_COMMAND_CHANNEL_ID: ${STAFF_COMMAND_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `VIP_PANEL_CHANNEL_ID: ${VIP_PANEL_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `VIP_CATEGORY_ID: ${VIP_CATEGORY_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `VIP_LOG_CHANNEL_ID: ${VIP_LOG_CHANNEL_ID ? "✅ configurado" : "⚠️ não configurado"}`,
      `Verificação automática: ✅ ativa a cada ${MP_POLL_INTERVAL_SECONDS}s`,
      `Entrega Minecraft: FTB Ranks + /darpontosvip, sem tag antigo e sem scoreboard direto`,
      `Jogador online para entrega: ✅ necessário para aplicar Pontos VIP via /darpontosvip`,
      `Botão de entrega: ✅ Receber VIP agora + Informar/editar nick`,
      `Verificação online: ✅ nick puro/exato, sem prefixo ou tag`,
      `Fechamento automático sem pagamento: ✅ ${VIP_TICKET_AUTO_CLOSE_MINUTES}min`,
      `Ticket aprovado aguardando entrega: ✅ não fecha automaticamente`,
      `Duração do VIP: ${VIP_DURATION_DAYS} dias`,
      `Verificador de vencimento: ✅ ativo a cada ${VIP_EXPIRY_CHECK_INTERVAL_MINUTES}min`,
      `Avisos automáticos: faltando ${VIP_WARNING_DAYS.join(", ")} dia(s)`,
      "",
      "Obs: mesmo sem webhook configurado, o bot tenta confirmar pagamentos pela API automaticamente."
    ].join("\n"));
    return;
  }

  if (!content.startsWith(`${PREFIX}rank`)) return;

  const args = content.slice(`${PREFIX}rank`.length).trim().split(/\s+/).filter(Boolean);
  const rankKey = (args[0] || "menu").toLowerCase();

  if (rankKey === "menu" || rankKey === "ajuda" || rankKey === "help") {
    await message.reply({ embeds: [buildMenuEmbed()] });
    return;
  }

  if (!ranks[rankKey]) {
    await message.reply(`❌ Ranking inválido. Use \`${PREFIX}rank\` para ver a lista.`);
    return;
  }

  const loading = await message.reply(`🔎 Buscando ranking **${rankKey}**...`);

  try {
    const rows = await getRanking(rankKey);
    await loading.edit({ content: "", embeds: [buildRankingEmbed(rankKey, rows)] });
  } catch (error) {
    console.error(error);
    await loading.edit("❌ Não consegui buscar o ranking. Confira se o RCON está ativo e se o datapack `atm11_rankings_discord` está instalado.");
  }
});


const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.post("/webhook/mercadopago", async (req, res) => {
  try {
    const paymentId = req.body?.data?.id || req.body?.id || req.query?.id || req.query?.["data.id"];
    if (paymentId) await processMercadoPagoPayment(paymentId);
    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook Mercado Pago:", error);
    res.sendStatus(200);
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Servidor web do bot ouvindo na porta ${PORT}`);
});


client.login(TOKEN);
