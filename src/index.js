require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { Rcon } = require("rcon-client");
const fs = require("fs");
const path = require("path");

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
      `\`${PREFIX}finalizarsorteio\``
    ].join("\n"),
    0x8a2be2
  );
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
