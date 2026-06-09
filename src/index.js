require("dotenv").config();

const {Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags} = require("discord.js");
const { Rcon } = require("rcon-client");
const fs = require("fs");
const path = require("path");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "";
const PREFIX = process.env.PREFIX || "!";
const TOP_LIMIT = Number(process.env.TOP_LIMIT || 10);

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = Number(process.env.RCON_PORT || 25575);
const RCON_PASSWORD = process.env.RCON_PASSWORD;

const DATA_DIR = path.join(process.cwd(), "data");
const EVENT_FILE = path.join(DATA_DIR, "evento.json");
const GIVEAWAY_FILE = path.join(DATA_DIR, "sorteio.json");

const PURCHASES_FILE = path.join(DATA_DIR, "compras_vip.json");

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const VIP_PANEL_CHANNEL_ID = process.env.VIP_PANEL_CHANNEL_ID || "";
const VIP_CATEGORY_ID = process.env.VIP_CATEGORY_ID || "";
const VIP_LOG_CHANNEL_ID = process.env.VIP_LOG_CHANNEL_ID || "";
const VIP_STAFF_ROLE_ID = process.env.VIP_STAFF_ROLE_ID || "";

const vipRanges = [
  { key: "ferro", name: "VIP Ferro", emoji: "⚒️", min: 5, max: 10, rank: "vip1", rewardFunction: "vip_rewards:vip/vip1", rewardText: "2 pontos a cada 5 horas online" },
  { key: "ouro", name: "VIP Ouro", emoji: "🟡", min: 11, max: 20, rank: "vip2", rewardFunction: "vip_rewards:vip/vip2", rewardText: "3 pontos a cada 5 horas online" },
  { key: "diamante", name: "VIP Diamante", emoji: "💎", min: 21, max: 30, rank: "vip3", rewardFunction: "vip_rewards:vip/vip3", rewardText: "5 pontos a cada 5 horas online" },
  { key: "netherita", name: "VIP Netherita", emoji: "🔥", min: 31, max: 9999, rank: "vip4", rewardFunction: "vip_rewards:vip/vip4", rewardText: "8 pontos a cada 5 horas online" }
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
    "🏷️ Sistema de VIPs ATM 11",
    [
      "Ao apoiar o servidor, o jogador recebe o VIP correspondente à faixa de doação e benefícios extras dentro do servidor.",
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
      "🎁 Recompensa online: **2 pontos a cada 5 horas online**",
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
      "🎁 Recompensa online: **3 pontos a cada 5 horas online**",
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
      "🎁 Recompensa online: **5 pontos a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "🔥 **VIP Netherita** — Doações de **R$31 a R$50**",
      "🧱 Claims: **500 chunks**",
      "⚡ Force load: **120 chunks**",
      "🏠 Homes: **50 homes**",
      "⏳ Cooldown de home: **instantâneo**",
      "↩️ /back: **instantâneo**",
      "🌍 /spawn: **instantâneo**",
      "🎲 /rtp: **instantâneo**",
      "🎁 Recompensa online: **8 pontos a cada 5 horas online**",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━",
      "📌 Os pontos podem ser usados na loja do spawn para comprar kits e recompensas.",
      "🛒 A loja é acessada pela **placa no spawn**."
    ].join("\n"),
    0xff9900
  );
}

function buildKitsEmbed() {
  return baseEmbed(
    "🛒 Kits da Loja ATM 11",
    [
      "**Kits iniciais:**",
      "🍖 Comida — `1 ponto`",
      "⛏️ Mineração Ferro — `2 pontos`",
      "💎 Mineração Diamante — `4 pontos`",
      "🛠️ Mineração Netherita — `8 pontos`",
      "🧪 Poção — `2 pontos`",
      "",
      "**Tecnologia e utilidades:**",
      "💠 AE2 Básico — `5 pontos`",
      "🌌 AE2 Avançado — `30 pontos`",
      "🧭 Waystones — `2 pontos`",
      "🎒 Mochila Ferro — `2 pontos`",
      "🎒 Mochila Diamante — `8 pontos`",
      "📦 Sophisticated Storage — `10 pontos`",
      "🌀 Dimensional Storage — `10 pontos`",
      "🏘️ Easy Villagers — `6 pontos`",
      "🏘️ Easy Villagers Premium — `15 pontos`",
      "",
      "**Avançados:**",
      "🏗️ Building Gadgets — `10 pontos`",
      "⚡ Powah Niotic — `15 pontos`",
      "⚡ Powah Nitro — `30 pontos`",
      "💾 Refined Storage Básico — `20 pontos`",
      "💾 Refined Storage Avançado — `30 pontos`",
      "🌱 Mystical Agriculture — `20 pontos`",
      "",
      "**AllTheModium:**",
      "✨ AllTheModium Ferramentas — `20 pontos`",
      "🛡️ AllTheModium Armadura — `30 pontos`",
      "💜 Vibranium Ferramentas — `25 pontos`",
      "🛡️ Vibranium Armadura — `35 pontos`",
      "🌌 Unobtainium Ferramentas — `30 pontos`",
      "🛡️ Unobtainium Armadura — `40 pontos`",
      "",
      "A loja fica no **spawn** e o acesso é pela **placa da loja**."
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
      "**Informações:**",
      `\`${PREFIX}ip\` — IP do servidor`,
      `\`${PREFIX}discord\` — link do Discord`,
      `\`${PREFIX}regras\` — regras do servidor`,
      `\`${PREFIX}vip\` — benefícios dos VIPs`,
      `\`${PREFIX}kits\` — kits da loja`,
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
      `\`${PREFIX}vipsetup\` — criar painel VIP`
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

function createVipPanelEmbed() {
  return baseEmbed(
    "💎 Loja VIP ATM 11",
    [
      "Escolha abaixo a faixa de VIP que deseja comprar/apoiar.",
      "",
      "Depois da escolha, o bot abrirá uma sala privada e vai gerar o Pix/QR Code pelo Mercado Pago.",
      "",
      "**Faixas disponíveis:**",
      "⚒️ **VIP Ferro** — Doação de **R$5 a R$10**",
      "🟡 **VIP Ouro** — Doação de **R$11 a R$20**",
      "💎 **VIP Diamante** — Doação de **R$21 a R$30**",
      "🔥 **VIP Netherita** — Doação de **R$31 ou mais**",
      "",
      "📌 **Cada R$1 doado = 1 ponto de doação.**",
      "Após o pagamento aprovado, você enviará seu nick exato do Minecraft para receber o VIP automaticamente."
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
      description: `${vip.rewardText} • 1 real = 1 ponto`,
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

async function createPrivateVipChannel(interaction, vip, amount) {
  const guild = interaction.guild;
  if (!guild) throw new Error("Este comando precisa ser usado dentro do servidor Discord.");
  const channelName = `compra-vip-${interaction.user.username}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
  const options = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
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
  const rawUrl = String(PUBLIC_URL || "").trim();

  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);

    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }

    // Mercado Pago não aceita domínio privado/local como webhook.
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
    await channel.send([
      "✅ **Pagamento aprovado!**",
      "",
      `VIP: **${compra.vip.name}**`,
      `Valor pago: **${formatMoney(compra.amount)}**`,
      `Pontos de doação: **${compra.points}**`,
      "",
      "Agora envie seu nick exato do Minecraft usando:",
      `\`${PREFIX}nick SeuNick\``,
      "",
      "Exemplo:",
      `\`${PREFIX}nick AndersonAriel\``
    ].join("\n"));
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
    const commands = [
      `ftbranks add ${nick} ${vip.rank}`,
      `scoreboard players add ${nick} pontos_doacao ${points}`,
      `execute as ${nick} run function ${vip.rewardFunction}`,
      `tellraw @a [{"text":"✦ ","color":"gold","bold":true},{"text":"${nick}","color":"yellow","bold":true},{"text":" é o mais novo ${vip.name} do servidor! Obrigado pelo apoio!","color":"green"}]`
    ];
    const results = [];
    for (const command of commands) {
      const result = await rcon.send(command);
      results.push({ command, result });
    }
    return results;
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
  await interaction.editReply(`✅ Criei uma sala privada para sua compra: ${channel}`);
  await channel.send([
    `Olá ${interaction.user}!`,
    "",
    "Esta é sua sala privada de compra VIP.",
    "",
    `VIP escolhido: **${vip.name}**`,
    `Valor escolhido: **${formatMoney(amount)}**`,
    `Pontos de doação: **${Math.floor(amount)}**`,
    `Recompensa online: **${vip.rewardText}**`,
    "",
    "Gerando QR Code Pix pelo Mercado Pago..."
  ].join("\n"));
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
    await channel.send([
      "❌ **Não consegui gerar o Pix agora.**",
      "",
      "O Mercado Pago recusou a criação do pagamento ou alguma configuração está incorreta.",
      "",
      "**O que fazer:**",
      "• Avise a Staff para verificar o Mercado Pago.",
      "• Você não foi cobrado por essa tentativa.",
      "• Depois que a Staff corrigir, tente comprar novamente.",
      "",
      "Possíveis causas: token inválido, PUBLIC_URL incorreta, webhook/domínio privado ou e-mail de pagador recusado pelo Mercado Pago.",
      "",
      "Dica para Staff: PUBLIC_URL precisa ser o domínio público HTTPS do Railway, exemplo:",
      "`https://seu-projeto.up.railway.app`"
    ].join("\n"));
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
  if (!compra) { await message.reply("❌ Não encontrei uma compra VIP sua nesta sala."); return; }
  if (compra.status !== "pagamento_aprovado") { await message.reply("⚠️ Seu pagamento ainda não foi aprovado. Aguarde a confirmação automática do Mercado Pago."); return; }
  if (compra.minecraftNick) { await message.reply("⚠️ Esta compra já teve um nick definido e o VIP já foi entregue/processado."); return; }
  compra.minecraftNick = nick;
  compra.status = "aplicando_vip";
  compra.updatedAt = new Date().toISOString();
  updateCompraVip(compra);
  await message.reply("⏳ Pagamento aprovado. Aplicando VIP no servidor...");
  try {
    await applyVipToMinecraft(compra, nick);
    compra.status = "vip_entregue";
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);
    await message.reply([
      "✅ **VIP entregue com sucesso!**",
      "",
      `Nick: **${nick}**`,
      `VIP: **${compra.vip.name}**`,
      `Pontos adicionados: **${compra.points}**`,
      `Recompensa online: **${compra.vip.rewardText}**`,
      "",
      "Obrigado por apoiar o servidor!"
    ].join("\n"));
    await notifyVipLog(compra, `🎉 VIP entregue: ${nick} | ${compra.vip.name} | ${formatMoney(compra.amount)} | ${compra.points} pontos`);
  } catch (error) {
    console.error(error);
    compra.status = "erro_entrega";
    compra.updatedAt = new Date().toISOString();
    updateCompraVip(compra);
    await message.reply("❌ Pagamento aprovado, mas houve erro ao aplicar o VIP via RCON. Avise a Staff.");
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", () => {
  console.log(`Bot online como ${client.user.tag}`);
  client.user.setActivity("ATM 11 | !rank");

  if (!MP_ACCESS_TOKEN) {
    console.warn("AVISO: MP_ACCESS_TOKEN não configurado. O painel VIP abre, mas não conseguirá gerar Pix.");
  }

  if (!PUBLIC_URL) {
    console.warn("AVISO: PUBLIC_URL não configurada. O Mercado Pago não conseguirá avisar pagamento aprovado por webhook.");
  }
});


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
  const isVipRelatedCommand = content === `${PREFIX}comprarvip` || content === `${PREFIX}vipsetup` || content === `${PREFIX}painelvip` || content.startsWith(`${PREFIX}nick `);
  const isVipPanelChannel = VIP_PANEL_CHANNEL_ID && message.channel.id === VIP_PANEL_CHANNEL_ID;
  const isPrivateVipChannel = message.channel.name?.startsWith("compra-vip-");

  if (CHANNEL_ID && message.channel.id !== CHANNEL_ID && !(isVipRelatedCommand && (isVipPanelChannel || isPrivateVipChannel))) return;

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
    if (VIP_PANEL_CHANNEL_ID && message.channel.id !== VIP_PANEL_CHANNEL_ID) {
      await message.reply("⚠️ O painel VIP deve ser criado no canal configurado em VIP_PANEL_CHANNEL_ID.");
      return;
    }
    await message.channel.send({ embeds: [createVipPanelEmbed()], components: [createVipSelectRow()] });
    await message.reply("✅ Painel VIP criado com sucesso.");
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
