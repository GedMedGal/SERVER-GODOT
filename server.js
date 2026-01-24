const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log("Chat + Time server running on port", PORT);

// =====================
// UTC TIME
// =====================
function getUtcTime() {
  const now = new Date();

  return {
    type: "time",
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    second: now.getUTCSeconds(),
    unix: Math.floor(now.getTime() / 1000)
  };
}

// =====================
// BROADCAST
// =====================
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

// =====================
// CONNECTION
// =====================
wss.on("connection", ws => {
  ws.nickname = "Guest";

  // 👉 сразу отправляем UTC-время при подключении
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    // =====================
    // JOIN
    // =====================
    if (data.type === "join") {
      ws.nickname = String(data.name).substring(0, 16);
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    // =====================
    // CHAT MESSAGE
    // =====================
    if (data.type === "message") {
      if (!data.text || data.text.length > 200) return;

      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text
      });
      return;
    }

    // =====================
    // TIME REQUEST
    // =====================
    if (data.type === "time_request") {
      ws.send(JSON.stringify(getUtcTime()));
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

// =====================
// OPTIONAL: AUTO TIME BROADCAST
// =====================
// Раз в минуту рассылаем UTC всем
setInterval(() => {
  broadcast(getUtcTime());
}, 60_000);
