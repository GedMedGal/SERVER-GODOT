const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log("Chat + Time server running on port", PORT);

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
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

// ---------- CONNECTION ----------
wss.on("connection", ws => {
  ws.nickname = "Guest";

  // сразу отправляем время + сезон
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw); }
    catch { return; }

    // JOIN
    if (data.type === "join") {
      ws.nickname = String(data.name).substring(0, 16);
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    // MESSAGE
    if (data.type === "message") {
      if (!data.text || data.text.length > 200) return;
      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text
      });
      return;
    }
  });

  ws.on("close", () => {
    broadcast({
      type: "system",
      text: `${ws.nickname} left the chat`
    });
  });
});

// раз в минуту обновляем время всем
setInterval(() => {
  broadcast(getUtcTime());
}, 60_000);
