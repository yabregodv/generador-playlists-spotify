const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database/db"); // NUEVO

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// =============================================
// SPOTIFY TOKEN
// =============================================
const CLIENT_ID = "1b82ef41f6ac45dd8e363f255de9ab73";
const CLIENT_SECRET = "13afd66fb7614809b0d0eff626cbb813";

app.get("/spotify-token", async (req, res) => {
  try {
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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error token Spotify", details: err });
  }
});

// =============================================
// ENDPOINTS DE AUTENTICACIÓN CON SQLITE
// =============================================

// REGISTRO
app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  db.run(
    `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
    [name, email, password],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "Email ya existe" });
      }
      res.json({ id: this.lastID, name, email });
    }
  );
});

// LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT id, name, email FROM users WHERE email = ? AND password = ?`,
    [email, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Error interno" });

      if (!row) return res.status(401).json({ error: "Credenciales inválidas" });

      res.json(row);
    }
  );
});

// =============================================
// PLAYLISTS
// =============================================

// GUARDAR PLAYLIST
app.post("/save-playlist", (req, res) => {
  const { user_id, name, mood, playlist } = req.body;

  db.run(
    `INSERT INTO playlists (user_id, name, mood, data, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [user_id, name, mood, JSON.stringify(playlist)],
    function (err) {
      if (err) return res.status(500).json({ error: "Error guardando playlist" });

      res.json({ playlist_id: this.lastID });
    }
  );
});

// OBTENER PLAYLISTS DEL USUARIO
app.get("/user-playlists/:user_id", (req, res) => {
  db.all(
    `SELECT id, name, mood, data, created_at FROM playlists WHERE user_id = ?`,
    [req.params.user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Error obteniendo playlists" });

      const formatted = rows.map(r => ({
        id: r.id,
        name: r.name,
        mood: r.mood,
        createdAt: r.created_at,
        tracks: JSON.parse(r.data)
      }));

      res.json(formatted);
    }
  );
});

// =============================================
// LIKES DE CANCIONES
// =============================================

// 1) Dar LIKE a una canción
app.post("/api/songs/like", (req, res) => {
  const {
    user_id,
    track_id,
    track_name,
    artist,
    mood,
    album,
    image
  } = req.body;

  if (!user_id || !track_id) {
    return res.status(400).json({ error: "user_id y track_id son obligatorios" });
  }

  const sql = `
    INSERT OR IGNORE INTO liked_songs 
    (user_id, track_id, track_name, artist, mood, album, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [user_id, track_id, track_name, artist, mood, album, image],
    function (err) {
      if (err) {
        console.error("Error insertando like:", err);
        return res.status(500).json({ error: "Error guardando like" });
      }

      // this.changes será 0 si ya existía el like (por UNIQUE)
      res.json({ success: true });
    }
  );
});

// 2) Quitar LIKE
app.delete("/api/songs/unlike/:user_id/:track_id", (req, res) => {
  const { user_id, track_id } = req.params;

  db.run(
    `DELETE FROM liked_songs WHERE user_id = ? AND track_id = ?`,
    [user_id, track_id],
    function (err) {
      if (err) {
        console.error("Error borrando like:", err);
        return res.status(500).json({ error: "Error eliminando like" });
      }

      res.json({ success: true });
    }
  );
});

// 3) Obtener canciones con LIKE del usuario
app.get("/api/songs/liked/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.all(
    `SELECT 
       id,
       track_id,
       track_name,
       artist,
       mood,
       album,
       image,
       created_at
     FROM liked_songs
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [user_id],
    (err, rows) => {
      if (err) {
        console.error("Error obteniendo liked_songs:", err);
        return res.status(500).json({ error: "Error obteniendo canciones favoritas" });
      }

      res.json(rows);
    }
  );
});

// 4) Recomendaciones inteligentes basadas en moods
app.get("/api/recommendations/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.all(
    `SELECT mood FROM liked_songs WHERE user_id = ?`,
    [user_id],
    (err, rows) => {
      if (err) {
        console.error("Error en recomendaciones:", err);
        return res.status(500).json({ error: "Error generando recomendaciones" });
      }

      if (!rows || rows.length === 0) {
        // Caso sin likes: devolvemos siempre las mismas claves
        return res.json({
          recommendedMoods: [],
          message: "",
          topMood: null,
          stats: {}
        });
      }

      const moodCount = {};
      rows.forEach((r) => {
        const mood = (r.mood || "").toLowerCase().trim();
        if (!mood) return;
        moodCount[mood] = (moodCount[mood] || 0) + 1;
      });

      const entries = Object.entries(moodCount).sort((a, b) => b[1] - a[1]);
      const recommendedMoods = entries.slice(0, 3).map(([mood]) => mood);
      const topMood = recommendedMoods[0] || null;
      const totalLikes = rows.length;

      const message = `Basado en tus ${totalLikes} canciones favoritas, te recomendamos estos estados de ánimo`;

      res.json({
        recommendedMoods,
        message,
        topMood,
        stats: moodCount
      });
    }
  );
});


// =============================================
// SERVIDOR
// =============================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
});
