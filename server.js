const WebSocket = require("ws");
const http = require("http");

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
  ws.lastActive = Date.now(); // Инициализация активности

  // Отправляем текущее время при подключении
  ws.send(JSON.stringify(getUtcTime()));

  ws.on("message", raw => {
    let data;
    try { 
      data = JSON.parse(raw); 
    } catch { 
      return; 
    }

    // КРИТИЧНО: обновляем активность ПЕРЕД обработкой
    ws.lastActive = Date.now();

    // === ОБРАБОТКА PING (ключевое исправление) ===
    if (data.type === "ping") {
      ws.send(JSON.stringify({ 
        type: "pong", 
        timestamp: Date.now(),
        client_time: data.client_time || 0 
      }));
      return; // НЕ рассылаем другим!
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

    // SYSTEM MESSAGE
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

// Рассылка времени каждую минуту
setInterval(() => {
  broadcast(getUtcTime());
}, 60_000);

// === ЗАЩИТА ОТ НЕАКТИВНОСТИ (главное исправление) ===
const INACTIVITY_TIMEOUT = 90_000; // 90 секунд
setInterval(() => {
  const now = Date.now();
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && now - ws.lastActive > INACTIVITY_TIMEOUT) {
      console.log(`[KICK] ${ws.nickname} inactive for ${(now - ws.lastActive)/1000}s`);
      ws.close(1000, "Inactive"); // 1000 = нормальное закрытие
    }
  });
}, 30_000); // Проверка каждые 30 сек

// Self-ping для предотвращения сна сервера на Render
setInterval(() => {
  http.get({ host: "localhost", port: PORT, path: "/" }, res => {
    console.log(`[SERVER] Self-ping OK (${res.statusCode})`);
    res.resume();
  }).on("error", err => {
    console.log("[SERVER] Self-ping failed:", err.message);
  });
}, 600_000); // Каждые 10 минут
