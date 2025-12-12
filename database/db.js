const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Ruta absoluta hacia playlist.db
const dbPath = path.join(__dirname, "..", "playlist.db");

// Crear conexión a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error abriendo base de datos:", err);
  } else {
    console.log("Base de datos SQLite cargada correctamente");
  }
});

// =======================
// TABLAS DEL SISTEMA
// =======================

db.serialize(() => {
  // Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  // Token Spotify OAuth
  db.run(`
    CREATE TABLE IF NOT EXISTS spotify_tokens (
      user_id INTEGER PRIMARY KEY,      -- AHORA ES UNIQUE Y PRIMARY KEY
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Playlists guardadas en tu sistema
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      mood TEXT,
      tracks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

// Exportar la instancia de la base de datos
module.exports = db;
