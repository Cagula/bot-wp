const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const chalk = require("chalk");

// -------------------------------
// SISTEM START / STOP / PERMISII
// -------------------------------
let botActive = true;
let allowedUsers = new Set();
let allowAllGroup = false;

// Delay spam (default 0.5 sec)
let spamDelay = 500;

// -------------------------------
// PORNIRE BOT
// -------------------------------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
    version
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("Reconectare..."));
        startBot();
      } else {
        console.log(chalk.red("Ai fost delogat."));
      }
    } else if (connection === "open") {
      console.log(chalk.green("CagulaBot este online pe Render!"));
    }
  });

  // -------------------------------
  // HANDLER MESAJ
  // -------------------------------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith("@g.us");
    const isPrivate = chatId.endsWith("@s.whatsapp.net");
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isGroup && !isPrivate) return;

    const text = extractMessage(msg.message);
    if (!text) return;

    await handleCommand(sock, chatId, text.toLowerCase(), isGroup, msg, sender);
  });
}

// -------------------------------
// EXTRACTOR MESAJ
// -------------------------------
function extractMessage(message) {
  try {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    return null;
  } catch {
    return null;
  }
}

// -------------------------------
// HANDLER COMENZI
// -------------------------------
async function handleCommand(sock, chatId, text, isGroup, msg, sender) {

  // -------------------------------
  // SETARE DELAY SPAM: /spam5 /spam10 /spam0.5 etc.
  // -------------------------------
  if (text.startsWith("/spam")) {
    const value = text.replace("/spam", "").trim();

    if (!value || isNaN(value)) {
      await sock.sendMessage(chatId, { text: "⚠ Folosește: /spam5 /spam10 /spam0.5" });
      return;
    }

    spamDelay = Number(value) * 1000;

    await sock.sendMessage(chatId, { 
      text: `⏱ Delay spam setat la ${value} secunde!`
    });

    return;
  }

  // STOP
  if (text === "!stop") {
    botActive = false;
    allowedUsers.clear();
    allowAllGroup = false;
    await sock.sendMessage(chatId, { text: "⛔ Bot oprit!" });
    return;
  }

  // START
  if (text === "!start") {
    botActive = true;
    await sock.sendMessage(chatId, { text: "✅ Bot pornit!" });
    return;
  }

  // START @user
  if (text.startsWith("!start @")) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned) {
      await sock.sendMessage(chatId, { text: "⚠ Trebuie să menționezi un user!" });
      return;
    }

    mentioned.forEach(u => allowedUsers.add(u));

    await sock.sendMessage(chatId, {
      text: `👤 Bot pornit pentru: ${mentioned.map(u => "@" + u.split("@")[0]).join(", ")}`,
      mentions: mentioned
    });
    return;
  }

  // START @all
  if (text === "!start @all") {
    if (!isGroup) {
      await sock.sendMessage(chatId, { text: "⚠ Comanda merge doar pe grup!" });
      return;
    }

    allowAllGroup = true;
    await sock.sendMessage(chatId, { text: "👥 Bot activ pentru toți membrii grupului!" });
    return;
  }

  // FILTRARE PERMISII
  if (!botActive) return;
  if (isGroup && !allowAllGroup && !allowedUsers.has(sender)) return;

  // -------------------------------
  // SPAM TEXT DIN FIȘIER
  // -------------------------------
  if (text.startsWith("!spam ")) {
    const fileName = text.split(" ")[1];
    const filePath = path.join(__dirname, "spam", fileName);

    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(chatId, { text: "⚠ Fișierul nu există!" });
      return;
    }

    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    await sock.sendMessage(chatId, { text: `🚀 Pornesc spam-ul din: ${fileName}` });

    for (const line of lines) {
      if (!botActive) break;
      await sock.sendMessage(chatId, { text: line.trim() });
      await delay(spamDelay);
    }

    await sock.sendMessage(chatId, { text: "✅ Spam finalizat!" });
    return;
  }

  // -------------------------------
  // SPAM MEDIA
  // -------------------------------
  if (text.startsWith("!spammedia ")) {
    const folderName = text.split(" ")[1];
    const folderPath = path.join(__dirname, "spam", folderName);

    if (!fs.existsSync(folderPath)) {
      await sock.sendMessage(chatId, { text: "⚠ Folderul nu există!" });
      return;
    }

    const files = fs.readdirSync(folderPath);

    await sock.sendMessage(chatId, { text: `📸 Pornesc spam media din: ${folderName}` });

    for (const file of files) {
      if (!botActive) break;

      const filePath = path.join(folderPath, file);
      const buffer = fs.readFileSync(filePath);

      if (file.endsWith(".jpg") || file.endsWith(".png")) {
        await sock.sendMessage(chatId, { image: buffer });
      } else if (file.endsWith(".mp4")) {
        await sock.sendMessage(chatId, { video: buffer });
      }

      await delay(spamDelay);
    }

    await sock.sendMessage(chatId, { text: "✅ Spam media finalizat!" });
    return;
  }

  // -------------------------------
  // SPAM RAPID
  // -------------------------------
  if (text.startsWith("!spamfast ")) {
    const fileName = text.split(" ")[1];
    const filePath = path.join(__dirname, "spam", fileName);

    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(chatId, { text: "⚠ Fișierul nu există!" });
      return;
    }

    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    await sock.sendMessage(chatId, { text: `⚡ Pornesc spam-ul rapid din: ${fileName}` });

    for (const line of lines) {
      if (!botActive) break;
      await sock.sendMessage(chatId, { text: line.trim() });
    }

    await sock.sendMessage(chatId, { text: "⚡ Spam rapid finalizat!" });
    return;
  }

  // -------------------------------
  // SPAM RANDOM
  // -------------------------------
  if (text.startsWith("!spamrandom ")) {
    const fileName = text.split(" ")[1];
    const filePath = path.join(__dirname, "spam", fileName);

    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(chatId, { text: "⚠ Fișierul nu există!" });
      return;
    }

    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    await sock.sendMessage(chatId, { text: `🎲 Pornesc spam random din: ${fileName}` });

    for (let i = 0; i < 50; i++) {
      if (!botActive) break;

      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      await sock.sendMessage(chatId, { text: randomLine.trim() });

      await delay(spamDelay);
    }

    await sock.sendMessage(chatId, { text: "🎲 Spam random finalizat!" });
    return;
  }

  // -------------------------------
  // VIEW ONCE BYPASS (.vv)
  // -------------------------------
  if (text === ".vv") {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx || !ctx.stanzaId) {
        await sock.sendMessage(chatId, { text: "⚠ Folosește .vv ca reply la o poză/video view-once!" });
        return;
      }

      const targetMsg = await sock.loadMessage(chatId, ctx.stanzaId);

      if (!targetMsg?.message?.viewOnceMessageV2) {
        await sock.sendMessage(chatId, { text: "⚠ Mesajul nu este view-once!" });
        return;
      }

      const real = targetMsg.message.viewOnceMessageV2.message;

      if (real.imageMessage) {
        const buffer = await sock.downloadMediaMessage({ message: real });
        await sock.sendMessage(chatId, { image: buffer, caption: "🔓 View-once deblocat!" });
      }

      if (real.videoMessage) {
        const buffer = await sock.downloadMediaMessage({ message: real });
        await sock.sendMessage(chatId, { video: buffer, caption: "🔓 View-once deblocat!" });
      }

    } catch (e) {
      await sock.sendMessage(chatId, { text: "❌ Eroare la deblocarea view-once!" });
      console.log("VV ERROR:", e);
    }

    return;
  }

  // -------------------------------
  // COMENZI SIMPLE
  // -------------------------------
  if (text === "!ping") {
    await sock.sendMessage(chatId, { text: "🏓 Pong!" });
  }

  if (text === "!status") {
    await sock.sendMessage(chatId, {
      text: isGroup ? "👥 Bot activ pe grup!" : "💬 Bot activ în privat!"
    });
  }
}

// -------------------------------
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

startBot();
