const express = require("express");
const axios = require("axios");
const querystring = require("querystring");
const path = require("path");
const db = require(path.join(__dirname, "db.js"));


const router = express.Router();

const CLIENT_ID = "1b82ef41f6ac45dd8e363f255de9ab73";
const CLIENT_SECRET = "13afd66fb7614809b0d0eff626cbb813";
const REDIRECT_URI = "http://127.0.0.1:3000/spotify/callback";

const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
  "user-read-email"
].join(" ");

// Paso 1: usuario hace clic en vincular cuenta Spotify
router.get("/login", (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).send("Falta user_id en la petición.");
  }

  const state = String(userId); // Para saber a qué usuario asociar el token

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    querystring.stringify({
      response_type: "code",
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state
    });

  res.redirect(authUrl);
});

// Paso 2: Callback de Spotify
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // user_id
  const userId = parseInt(state, 10);

  if (!userId) {
    return res.status(400).send("No se pudo determinar el usuario asociado.");
  }

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expires_at = Date.now() + expires_in * 1000;

    // Guardar tokens en SQLite
    const query = `
      INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id)
      DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at;
    `;

    db.run(
      query,
      [userId, access_token, refresh_token, expires_at],
      (err) => {
        if (err) {
          console.error("Error guardando token de Spotify:", err);
        } else {
          console.log("Token de Spotify guardado para usuario", userId);
        }
      }
    );

    // Redirigir de vuelta al frontend
    res.redirect("http://127.0.0.1:3000/?spotifyLinked=1");
  } catch (err) {
    console.error("Error en callback de Spotify:", err.response?.data || err);
    res.send("Error durante la autenticación con Spotify");
  }
});

module.exports = router;
