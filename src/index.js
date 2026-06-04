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

function buildEventoEmbed() {
  const eventoTitulo = process.env.EVENTO_TITULO || "🎉 Evento valendo VIP";
  const eventoTexto = process.env.EVENTO_TEXTO || "No próximo final de semana teremos evento valendo VIP. O formato ainda será anunciado, mas a ideia é fazer algo divertido, justo e bem legal para todos participarem.";
  const eventoPremio = process.env.EVENTO_PREMIO || "VIP para o vencedor";
  const eventoData = process.env.EVENTO_DATA || "Final de semana";

  return baseEmbed(
    eventoTitulo,
    [
      `📅 **Data:** ${eventoData}`,
      `🎁 **Prêmio:** ${eventoPremio}`,
      "",
      eventoTexto,
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
