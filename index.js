import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys"
import fs from "fs"

let globalSpam = false
let globalDelay = 1000

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth")
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on("creds.update", saveCreds)

    // LOGIN FĂRĂ QR — NUMĂR + COD SMS
    if (!sock.authState.creds.registered) {
        const phone = process.env.PHONE
        if (!phone) {
            console.log("Setează PHONE=+40xxxx în Render → Environment Variables")
            process.exit(0)
        }

        const pairingCode = await sock.requestPairingCode(phone)
        console.log("Cod primit:", pairingCode)
        console.log("Scrie codul primit aici în consola Render:")

        process.stdin.once("data", async (data) => {
            const code = data.toString().trim()
            await sock.confirmPairingCode(code)
            console.log("Autentificat fără QR!")
        })
    }

    console.log("Bot pornit pe Render!")

    // CITIRE SPAM.TXT
    const spamLines = fs.readFileSync("spam.txt", "utf8")
        .split("\n")
        .filter(x => x.trim() !== "")

    async function spam(jid) {
        globalSpam = true
        console.log("Spam pornit către:", jid)

        while (globalSpam) {
            for (const msg of spamLines) {
                if (!globalSpam) break
                await sock.sendMessage(jid, { text: msg })
                console.log("Trimis:", msg)
                await new Promise(r => setTimeout(r, globalDelay))
            }
        }

        console.log("Spam oprit.")
    }

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return

        const from = m.key.remoteJid
        const text =
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            ""

        // STOP
        if (text === "stop") {
            globalSpam = false
            await sock.sendMessage(from, { text: "Spam oprit." })
        }

        // START NUMĂR
        if (text.startsWith("start ")) {
            const nr = text.split(" ")[1]
            const jid = nr + "@s.whatsapp.net"
            spam(jid)
        }

        // START @USER
        if (text.startsWith("start @")) {
            const tag = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            if (tag) spam(tag)
        }

        // START @ALL
        if (text === "start @all") {
            const group = await sock.groupMetadata(from)
            for (const p of group.participants) {
                spam(p.id)
            }
        }

        // START NUMERIC (start1, start2, start30 etc)
        if (text.startsWith("start")) {
            const num = text.replace("start", "")
            if (!isNaN(num)) {
                globalDelay = Number(num) * 1000
                spam(from)
            }
        }

        // .vv = spam ultra rapid (delay 0)
        if (text === ".vv") {
            globalDelay = 0
            spam(from)
        }
    })
}

startBot()
