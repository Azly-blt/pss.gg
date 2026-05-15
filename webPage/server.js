const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); 

const app = express();
const API_KEY = 'RGAPI-b09dd9fb-e52d-421f-9794-14def39d994e'; 

app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. CONFIGURATION DE LA BASE DE DONNÉES SQLite
// ==========================================
const db = new sqlite3.Database(path.join(__dirname, 'nexus.sqlite'), (err) => {
    if (err) {
        console.error("❌ Erreur d'ouverture de la base de données :", err.message);
    } else {
        console.log("🗄️  Connecté à la base de données SQLite avec succès !");
    }
});

// Création des tables si elles n'existent pas
db.serialize(() => {
    // Table pour stocker les profils des joueurs
    db.run(`CREATE TABLE IF NOT EXISTS players (
        puuid TEXT PRIMARY KEY,
        summoner_id TEXT,
        gameName TEXT,
        tagLine TEXT,
        region TEXT,
        profileIconId INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table pour l'historique des LP
    db.run(`CREATE TABLE IF NOT EXISTS lp_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puuid TEXT,
        tier TEXT,
        rank TEXT,
        lp INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    console.log("✅ Tables SQLite prêtes !");

    db.run("DELETE FROM lp_tracking"); 
    console.log("🧹 BASE DE DONNÉES VIDÉE POUR LE TEST");
});

// ==========================================
// 2. PROXY API RIOT
// ==========================================
app.use('/api/riot', async (req, res) => {
    try {
        let targetPath = req.originalUrl.replace('/api/riot/', '');

        if (!targetPath || targetPath === '/') {
            return res.status(400).json({ error: "URL Riot manquante" });
        }

        if (targetPath.startsWith('/')) targetPath = targetPath.substring(1);

        const separator = targetPath.includes('?') ? '&' : '?';
        const finalUrl = `https://${targetPath}${separator}api_key=${API_KEY}`;
        
        console.log(`📡 Proxying : ${finalUrl}`);

        const response = await fetch(finalUrl);
        const data = await response.json();
        
        res.status(response.status).json(data);
    } catch (error) {
        console.error("🔥 Erreur interne :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// ==========================================
// 2.5 API INTERNE (Sauvegarde SQLite)
// ==========================================

// Route pour sauvegarder un joueur dans l'annuaire global
// Route pour sauvegarder OU fusionner un joueur
app.post('/api/savePlayer', (req, res) => {
    const { puuid, summoner_id, gameName, tagLine, region, profileIconId } = req.body;

    // 1. On cherche si le joueur existe déjà par son PUUID (Riot) OU par son Pseudo (Discord)
    const searchSql = "SELECT * FROM players WHERE puuid = ? OR gameName = ? COLLATE NOCASE";
    
    db.get(searchSql, [puuid, gameName], (err, row) => {
        if (err) {
            console.error("Erreur SQL lors de la recherche du joueur:", err.message);
            return res.status(500).json({ error: "Erreur serveur" });
        }

        if (row) {
            // FUSION : Le joueur existe déjà (créé par le bot ou déjà cherché sur le site)
            // On met à jour toutes ses infos Riot, SANS toucher à ses bet_points ou son discord_id
            const updateSql = `
                UPDATE players 
                SET puuid = ?, summoner_id = ?, gameName = ?, tagLine = ?, region = ?, profileIconId = ?
                WHERE id = ?
            `;
            // "row.id" suppose que tu as une colonne 'id' automatique, sinon utilise row.discord_id ou row.puuid selon ce qu'il a trouvé
            const identifier = row.discord_id ? { col: 'discord_id', val: row.discord_id } : { col: 'puuid', val: row.puuid };
            
            const finalUpdateSql = `
                UPDATE players 
                SET puuid = ?, summoner_id = ?, gameName = ?, tagLine = ?, region = ?, profileIconId = ?
                WHERE ${identifier.col} = ?
            `;

            db.run(finalUpdateSql, [puuid, summoner_id, gameName, tagLine, region, profileIconId, identifier.val], function(updateErr) {
                if (updateErr) console.error("Erreur lors de la fusion :", updateErr.message);
                else console.log(`🔗 Profil lié avec succès : ${gameName}#${tagLine}`);
                res.json({ success: true, message: "Profil mis à jour et lié." });
            });

        } else {
            // NOUVEAU JOUEUR : Il n'existe ni sur le Discord, ni sur le site
            const insertSql = `
                INSERT INTO players (puuid, summoner_id, gameName, tagLine, region, profileIconId, bet_points) 
                VALUES (?, ?, ?, ?, ?, ?, 0)
            `;
            db.run(insertSql, [puuid, summoner_id, gameName, tagLine, region, profileIconId], function(insertErr) {
                if (insertErr) console.error("Erreur création :", insertErr.message);
                else console.log(`✨ Nouveau profil Riot créé : ${gameName}#${tagLine}`);
                res.json({ success: true, message: "Nouveau joueur ajouté." });
            });
        }
    });
});

// Route pour sauvegarder un relevé de LP
app.post('/api/saveLp', (req, res) => {
    const { puuid, lp, tier, rank } = req.body;
    
    // 1. On cherche le tout dernier enregistrement pour ce joueur
    db.get(`SELECT lp FROM lp_tracking WHERE puuid = ? ORDER BY timestamp DESC LIMIT 1`, [puuid], (err, row) => {
        if (err) return res.status(500).json({ error: "Erreur DB" });

        // 2. On n'insère QUE SI les LP ont changé
        if (!row || row.lp !== lp) {
            db.run(`INSERT INTO lp_tracking (puuid, tier, rank, lp) VALUES (?, ?, ?, ?)`, 
            [puuid, tier, rank, lp], (err) => {
                if (err) return res.status(500).json({ error: "Erreur insertion" });
                console.log(`✨ NOUVEAU CHANGEMENT DÉTECTÉ : ${lp} LP pour ${puuid}`);
                res.json({ success: true, message: "LP enregistrés" });
            });
        } else {
            // Si c'est le même score, on ne fait rien
            res.json({ success: true, message: "Pas de changement" });
        }
    });
});

// Route pour récupérer l'historique des LP d'un joueur
app.get('/api/getLpHistory/:puuid', (req, res) => {
    // On convertit le timestamp SQLite en millisecondes directement dans la requête (timeMs)
    const sql = `
        SELECT puuid, tier, rank, lp, (strftime('%s', timestamp) * 1000) as timeMs 
        FROM lp_tracking 
        WHERE puuid = ? 
        ORDER BY timeMs DESC
    `;
    db.all(sql, [req.params.puuid], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur DB" });
        res.json(rows);
    });
});

// Route pour récupérer TOUS les joueurs (pour la barre de recherche globale)
app.get('/api/getAllPlayers', (req, res) => {
    db.all(`SELECT gameName as name, tagLine as tag, region, profileIconId as iconId FROM players ORDER BY last_updated DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur DB" });
        res.json(rows);
    });
});

app.get('/api/leaderboard', (req, res) => {
    // Cette requête utilise GROUP BY pour n'avoir qu'un PUUID unique
    // Et MAX(timestamp) pour s'assurer qu'on prend les données les plus fraîches
    const sql = `
        SELECT 
            p.gameName, 
            p.tagLine, 
            p.region, 
            p.profileIconId, 
            lt.tier, 
            lt.rank, 
            lt.lp,
            MAX(lt.timestamp) as last_update
        FROM players p
        INNER JOIN lp_tracking lt ON p.puuid = lt.puuid
        WHERE lt.tier IS NOT NULL
        GROUP BY p.puuid
        ORDER BY lt.lp DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Nouvelle route API pour le classement des Bet Points (BP)
app.get('/api/leaderboard-bp', (req, res) => {
    // Requête propre pour récupérer tous les champs triés par BP
    const sql = "SELECT * FROM players WHERE bet_points > 0 ORDER BY bet_points DESC LIMIT 50";

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur SQL BP:", err.message);
            res.status(500).json({ error: "Erreur lors de la récupération du classement BP" });
            return;
        }
        res.json(rows);
    });
});

// ==========================================
// 3. ROUTES DES PAGES HTML
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sécurité supplémentaire pour le multi-pages
app.get('/profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// ==========================================
// 3.5 TRACKER AUTOMATIQUE EN ARRIÈRE-PLAN
// ==========================================
async function autoUpdateAllPlayersLP() {
    console.log("🤖 [TRACKER] Lancement de la vérification automatique des LP...");

    // 1. On récupère tous les joueurs enregistrés dans notre base de données
    db.all(`SELECT puuid, region, gameName FROM players`, [], async (err, players) => {
        if (err || !players) return;

        for (const player of players) {
            try {
                // 2. On interroge Riot Games discrètement pour chaque joueur (avec le nouveau système par PUUID)
                const url = `https://${player.region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${player.puuid}?api_key=${API_KEY}`;
                const res = await fetch(url);
                
                if (!res.ok) continue; // Si Riot bloque (ex: rate limit), on passe au joueur suivant

                const data = await res.json();
                const soloQ = data.find(r => r.queueType === "RANKED_SOLO_5x5");

                if (soloQ) {
                    // 3. On regarde si on a déjà un record pour lui
                    db.get(`SELECT lp FROM lp_tracking WHERE puuid = ? ORDER BY timestamp DESC LIMIT 1`, [player.puuid], (err, row) => {
                        // 4. Si les LP ont changé, on enregistre silencieusement !
                        if (!row || row.lp !== soloQ.leaguePoints) {
                            db.run(`INSERT INTO lp_tracking (puuid, tier, rank, lp, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, 
                            [player.puuid, soloQ.tier, soloQ.rank, soloQ.leaguePoints], (err) => {
                                if (!err) {
                                    console.log(`⚡ [TRACKER] Mise à jour auto : ${player.gameName} est maintenant à ${soloQ.leaguePoints} LP !`);
                                }
                            });
                        }
                    });
                }
            } catch (e) {
                console.error(`Erreur Tracker pour ${player.gameName}:`, e.message);
            }

            // 🛑 TRÈS IMPORTANT : On attend 1 seconde entre chaque joueur pour ne pas se faire bannir par l'API Riot (Rate Limit)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log("🤖 [TRACKER] Vérification terminée. Prochain scan dans 5 minutes.");
    });
}

// On lance le robot une fois au démarrage du serveur...
setTimeout(autoUpdateAllPlayersLP, 5000); // Attend 5s après le démarrage

// ...puis on lui dit de recommencer TOUTES LES 5 MINUTES (300 000 millisecondes)
setInterval(autoUpdateAllPlayersLP, 300000);

// ==========================================
// 4. LANCEMENT DU SERVEUR
// ==========================================
app.listen(3000, '0.0.0.0', () => {
    console.log("==========================================");
    console.log("✅ SERVEUR NEXUS.GG DÉMARRÉ");
    console.log("🚀 Port : 3000");
    console.log("==========================================");
});