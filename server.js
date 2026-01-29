const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 10000;

/* ================= HTTP (Render keep-alive) ================= */
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

/* ================= WebSocket ================= */
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log("Chat + Time server running on port", PORT);
});

/* ================= TIME / SEASON ================= */
function getSeasonUTC(month) {
  if (month === 12 || month <= 2) return 0; // WINTER
  if (month <= 5) return 1; // SPRING
  if (month <= 8) return 2; // SUMMER
  return 3; // FALL
}

function getUtcTime() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return {
    type: "time",
    year: now.getUTCFullYear(),
    month,
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    second: now.getUTCSeconds(),
    unix: Math.floor(now.getTime() / 1000),
    season: getSeasonUTC(month)
  };
}

/* ================= BROADCAST ================= */
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg, err => {
        if (err) console.error("Send error:", err.message);
      });
    }
  });
}

/* ================= CONFIG ================= */
const INACTIVITY_TIMEOUT = 180_000;   // 3 минуты
const HEARTBEAT_INTERVAL = 60_000;    // лог сервера
const KICK_CHECK_INTERVAL = 30_000;   // AFK чек
const SELF_PING_INTERVAL = 5 * 60_000;

/* ================= CONNECTION ================= */
wss.on("connection", ws => {
  ws.nickname = "Guest";
  ws.lastActive = Date.now();

  // сразу отправляем время
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    /* ---------- PING / PONG ---------- */
    if (data.type === "ping") {
      ws.send(JSON.stringify({
        type: "pong",
        server_time: Date.now()
      }));
      return; // ❗ ping НЕ считается активностью
    }

    // всё остальное = активность
    ws.lastActive = Date.now();

    /* ---------- JOIN ---------- */
    if (data.type === "join") {
      ws.nickname = String(data.name || "Guest").slice(0, 16);
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    /* ---------- CHAT ---------- */
    if (data.type === "message") {
      if (
        typeof data.text !== "string" ||
        data.text.trim() === "" ||
        data.text.length > 200
      ) return;

      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text.trim()
      });
      return;
    }

    /* ---------- SYSTEM ---------- */
    if (data.type === "system") {
      if (typeof data.text !== "string") return;
      broadcast({
        type: "system",
        text: data.text.slice(0, 200)
      });
    }
  });

  ws.on("close", () => {
    broadcast({
      type: "system",
      text: `${ws.nickname} left the chat`
    });
  });

  ws.on("error", err => {
    console.error("WS error:", err.message);
  });
});

/* ================= TIME BROADCAST ================= */
setInterval(() => {
  broadcast(getUtcTime());
}, 60_000);

/* ================= AFK KICK ================= */
setInterval(() => {
  const now = Date.now();
  wss.clients.forEach(ws => {
    if (
      ws.readyState === WebSocket.OPEN &&
      now - ws.lastActive > INACTIVITY_TIMEOUT
    ) {
      console.log(
        `[KICK] ${ws.nickname} inactive for ${(now - ws.lastActive) / 1000}s`
      );
      ws.close(1000, "Inactive");
    }
  });
}, KICK_CHECK_INTERVAL);

/* ================= SERVER HEARTBEAT ================= */
function formatUptime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

setInterval(() => {
  let open = 0;
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) open++;
  });

  const now = new Date();
  console.log(
    `[HEARTBEAT] ${now.toISOString().replace("T", " ").slice(0, 19)} UTC | ` +
    `clients: ${wss.clients.size} | open: ${open} | uptime: ${formatUptime(process.uptime())}`
  );
}, HEARTBEAT_INTERVAL);

/* ================= SELF-PING (Render) ================= */
setInterval(() => {
  http.get(
    { host: "localhost", port: PORT, path: "/" },
    res => res.resume()
  ).on("error", () => {});
}, SELF_PING_INTERVAL);
