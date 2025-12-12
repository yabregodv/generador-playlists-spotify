const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./database/db.js");
const spotifyAuth = require("./database/authSpotify.js");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("."));

const CLIENT_ID = "1b82ef41f6ac45dd8e363f255de9ab73";
const CLIENT_SECRET = "13afd66fb7614809b0d0eff626cbb813";

// ======================================
// LOGIN
// ======================================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.status(400).json({ error: "Credenciales incorrectas" });

      res.json(row);
    }
  );
});

// ======================================
// REGISTRO
// ======================================
app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  db.run(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, password],
    function (err) {
      if (err) return res.status(500).json({ error: "El email ya existe" });

      res.json({
        id: this.lastID,
        name,
        email
      });
    }
  );
});

// ======================================
// GUARDAR PLAYLIST LOCAL (SQLite)
// ======================================
app.post("/save-playlist", (req, res) => {
  const { user_id, name, mood, playlist } = req.body;

  db.run(
    "INSERT INTO playlists (user_id, name, mood, tracks) VALUES (?, ?, ?, ?)",
    [user_id, name, mood, JSON.stringify(playlist)],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });

      res.json({ message: "Playlist guardada" });
    }
  );
});

// ======================================
// OBTENER PLAYLISTS DEL USUARIO
// ======================================
app.get("/user-playlists/:id", (req, res) => {
  db.all(
    "SELECT * FROM playlists WHERE user_id = ? ORDER BY id DESC",
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });

      const parsed = rows.map((p) => ({
        ...p,
        tracks: JSON.parse(p.tracks)
      }));

      res.json(parsed);
    }
  );
});

// ======================================
// TOKEN APP SPOTIFY (client_credentials) PARA BÚSQUEDAS
// ======================================
app.get("/spotify-token", async (req, res) => {
  try {
    const result = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    res.json(result.data);
  } catch (err) {
    console.error("Error obteniendo token app Spotify:", err.response?.data || err);
    res.status(500).json({ error: "No se pudo obtener token de Spotify" });
  }
});

// ======================================
// VER SI USUARIO TIENE CUENTA SPOTIFY VINCULADA
// ======================================
app.get("/spotify/user-token/:userId", (req, res) => {
  const userId = req.params.userId;

  db.get(
    "SELECT * FROM spotify_tokens WHERE user_id = ?",
    [userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.json({ linked: false });

      res.json({ linked: true });
    }
  );
});

// ======================================
// EXPORTAR PLAYLIST A SPOTIFY (REAL, PRIVADA)
// ======================================
app.post("/spotify/export-playlist", (req, res) => {
  const { user_id, name, description, uris } = req.body;

  if (!user_id || !name || !Array.isArray(uris) || uris.length === 0) {
    return res.status(400).json({ error: "Datos insuficientes para exportar playlist." });
  }

  db.get(
    "SELECT * FROM spotify_tokens WHERE user_id = ?",
    [user_id],
    async (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) {
        return res.status(400).json({
          error: "No hay cuenta de Spotify vinculada para este usuario."
        });
      }

      let accessToken = row.access_token;
      let refreshToken = row.refresh_token;
      let expiresAt = row.expires_at || 0;

      try {
        // Refrescar token si está vencido
        if (expiresAt && expiresAt <= Date.now() && refreshToken) {
          const refreshResp = await axios.post(
            "https://accounts.spotify.com/api/token",
            new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );

          accessToken = refreshResp.data.access_token;
          const newExpiresIn = refreshResp.data.expires_in || 3600;
          expiresAt = Date.now() + newExpiresIn * 1000;

          db.run(
            "UPDATE spotify_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?",
            [accessToken, expiresAt, user_id]
          );
        }

        // Obtener ID del usuario en Spotify
        const meResp = await axios.get("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const spotifyUserId = meResp.data.id;

        // Crear playlist PRIVADA
        const playlistResp = await axios.post(
          `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
          {
            name,
            description: description || "Playlist generada desde MoodPlaylist",
            public: false // PRIVADA
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          }
        );

        const playlistId = playlistResp.data.id;
        const playlistUrl = playlistResp.data.external_urls?.spotify;

        // Agregar tracks
        if (uris.length > 0) {
          await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
              uris
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            }
          );
        }

        res.json({
          success: true,
          url: playlistUrl
        });
      } catch (error) {
        console.error(
          "Error exportando playlist a Spotify:",
          error.response?.data || error
        );
        res.status(500).json({
          error: "Error al crear la playlist en Spotify."
        });
      }
    }
  );
});

// ======================================
// ROUTER DE AUTENTICACIÓN SPOTIFY (OAuth)
// ======================================
app.use("/spotify", spotifyAuth);

// ======================================
app.listen(3000, () =>
  console.log("Servidor escuchando en http://127.0.0.1:3000")
);
