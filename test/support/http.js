// Démarre l'application sur un port libre et fournit un petit client HTTP
const { createApp } = require("../../src/app");

async function startServer() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, url, { body, token, headers = {} } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "X-Player-Token": token } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  async function newPlayer() {
    const { data } = await request("POST", "/api/players");
    return data;
  }

  return { server, base, request, newPlayer, close: () => server.close() };
}

module.exports = { startServer };
