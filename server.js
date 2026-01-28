const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

// ---------------- HTTP SERVER ----------------
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});

// ---------------- WEBSOCKET ------------------
const wss = new WebSocket.Server({ server });

console.log("Starting server...");

// ---------- SEASON ----------
function getSeasonUTC(month) {
  if (month === 12 || month <= 2) return 0; // WINTER
  if (month >= 3 && month <= 5) return 1;  // SPRING
  if (month >= 6 && month <= 8) return 2;  // SUMMER
  return 3;                               // FALL
}

// ---------- UTC TIME ----------
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

// ---------- BROADCAST ----------
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ---------- SERVER TIME MESSAGE ----------
function broadcastServerTimeMessage() {
  const now = new Date();
  const timeText = now.toLocaleTimeString("ru-RU", { timeZone: "UTC" });

  broadcast({
    type: "system",
    text: `Время сервера (UTC): ${timeText}`
  });
}

// ---------- CONNECTION ----------
wss.on("connection", ws => {
  ws.nickname = "Guest";
  ws.lastPing = 0;

  console.log("Client connected");

  // 👉 только ОДИН раз при входе
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    // JOIN
    if (data.type === "join") {
      ws.nickname = String(data.name || "Guest").substring(0, 16);
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    // CHAT MESSAGE
    if (data.type === "message") {
      if (!data.text || data.text.length > 200) return;
      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text
      });
      return;
    }

    // CLIENT PING (НЕ триггерит чат)
    if (data.type === "
