const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log("Chat server running on port", PORT);

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN)
      c.send(msg);
  });
}

wss.on("connection", ws => {
  ws.nickname = "Guest";

  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw); }
    catch { return; }

    if (data.type === "join") {
      ws.nickname = data.name.substring(0, 16);
      broadcast({
        type: "system",
        text: `${ws.nickname} joined the chat`
      });
      return;
    }

    if (data.type === "message") {
      if (!data.text || data.text.length > 200) return;

      broadcast({
        type: "message",
        name: ws.nickname,
        text: data.text
      });
    }
  });

  ws.on("close", () => {
    broadcast({
      type: "system",
      text: `${ws.nickname} left the chat`
    });
  });
});
