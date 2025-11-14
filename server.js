const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// ⚙️ Credenciales Spotify
const CLIENT_ID = "1b82ef41f6ac45dd8e363f255de9ab73";
const CLIENT_SECRET = "13afd66fb7614809b0d0eff626cbb813";

// 🎧 Endpoint para obtener token de Spotify
app.get("/spotify-token", async (req, res) => {
  try {
    console.log("📡 Solicitando token a Spotify...");

    // fetch nativo (ya disponible en Node 18+)
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization":
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Error de respuesta Spotify:", data);
      return res.status(500).json({ error: "Spotify API error", details: data });
    }

    console.log("✅ Token recibido correctamente");
    res.json(data);
  } catch (err) {
    console.error("🔥 Error al solicitar token:", err);
    res.status(500).json({ error: "Error interno en el servidor", details: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://127.0.0.1:${PORT}`);
  console.log(`🌐 Abre tu app en http://127.0.0.1:${PORT}/index.html`);
});
