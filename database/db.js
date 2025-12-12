const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Ruta del archivo SQLite
const dbPath = path.join(__dirname, "moodplaylist.db");

// Crear conexión
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error al conectar DB:", err);
  else console.log("SQLite listo en:", dbPath);
});

// Crear tablas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mood TEXT NOT NULL,
      data TEXT NOT NULL, 
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
});

module.exports = db;
