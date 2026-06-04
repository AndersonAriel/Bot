require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { Rcon } = require("rcon-client");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "";
const PREFIX = process.env.PREFIX || "!";
const TOP_LIMIT = Number(process.env.TOP_LIMIT || 10);

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = Number(process.env.RCON_PORT || 25575);
const RCON_PASSWORD = process.env.RCON_PASSWORD;

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Bot online como ${client.user.tag}`);
  client.user.setActivity("ATM 11 | !rank");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (CHANNEL_ID && message.channel.id !== CHANNEL_ID) return;

  const content = message.content.trim();

  if (content === `${PREFIX}ping`) {
    await message.reply("🏓 Pong!");
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

client.login(TOKEN);
