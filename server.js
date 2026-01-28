const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ 
  port: PORT,
  clientTracking: true, // Включаем отслеживание клиентов
  perMessageDeflate: false // Отключаем сжатие для совместимости с Godot
});

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
      c.send(msg).catch(err => {
        console.error("Broadcast error:", err.message);
      });
    }
  });
}

// ---------- CONNECTION ----------
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.nickname = "Guest";

  // Отправляем время при подключении
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    ws.isAlive = true; // Сбрасываем таймер при ЛЮБОМ сообщении

    let data;
    try { 
      data = JSON.parse(raw); 
    } catch { 
      return; 
    }

    // PING от клиента (для совместимости)
    if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      return;
    }

    // JOIN
    if (data.type === "join") {
      ws.nickname = String(data.name).substring(0, 16) || "Guest";
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    // MESSAGE
    if (data.type === "message") {
      if (!data.text || typeof data.text !== "string" || data.text.trim() === "" || data.text.length > 200) return;
      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text.trim()
      });
      return;
    }

    // SYSTEM
    if (data.type === "system") {
      if (!data.text || typeof data.text !== "string" || data.text.length > 200) return;
      broadcast({
        type: "system",
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

  ws.on("error", err => {
    console.error(`WebSocket error (${ws.nickname}):`, err.message);
  });
});

// === КРИТИЧНО: АКТИВНЫЕ PING ОТ СЕРВЕРА К КЛИЕНТАМ ===
// Это обходит ограничения хостинга Render!
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log(`[KICK] ${ws.nickname || 'Guest'} не ответил на пинг`);
      return ws.terminate(); // Принудительное закрытие
    }

    ws.isAlive = false;
    ws.ping(); // ← СТАНДАРТНЫЙ WebSocket PING FRAME (не текст!)
  });
}, 30_000); // Каждые 30 секунд

// Рассылка времени
setInterval(() => {
  broadcast(getUtcTime());
}, 60_000);

// Self-ping для предотвращения сна сервера
setInterval(() => {
  http.get({ host: "localhost", port: PORT, path: "/" }, res => {
    res.resume();
  }).on("error", () => {});
}, 300_000); // Каждые 5 минут (чаще!)
