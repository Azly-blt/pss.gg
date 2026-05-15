/* =======================================================
   NEXUS.GG — script.js (FULL FIXED VERSION)
   ======================================================= */

let DDRAGON_VERSION = "";
let SPELLS_MAP = {};
let RUNES_MAP = {};

// ================= API =================
async function riotFetch(url) {
    const cleanUrl = url.replace('https://', '');
    const res = await fetch(`/api/riot/${cleanUrl}`);
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
    return res.json();
}

// ================= INIT =================
async function init() {
    await getVersion();
    await loadSpells();
    await loadRunes();

    if (window.location.pathname.includes('leaderboard.html')) {
        initLeaderboardPage(); 
        return;
    }

    if (window.location.pathname.includes('leaderboard-bp.html')) {
        initBPLeaderboardPage(); 
        return;
    }

    if (window.location.pathname.includes('profile.html')) {
        initProfilePage();
    }

    setupSearch();
    setupAutocomplete('main');
    setupAutocomplete('top');
}

// ================= DATA DRAGON =================
async function getVersion() {
    const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
        .then(res => res.json());
    DDRAGON_VERSION = versions[0];
}

async function loadSpells() {
    const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/summoner.json`)
        .then(res => res.json());

    Object.values(data.data).forEach(spell => {
        SPELLS_MAP[spell.key] = spell.id;
    });
}

async function loadRunes() {
    const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/runesReforged.json`)
        .then(res => res.json());

    // On parcourt l'arbre des runes pour remplir notre dictionnaire
    data.forEach(tree => {
        RUNES_MAP[tree.id] = tree.icon; // L'icône de l'arbre (ex: Domination)
        tree.slots.forEach(slot => {
            slot.runes.forEach(rune => {
                RUNES_MAP[rune.id] = rune.icon; // L'icône de la rune (ex: Électrocution)
            });
        });
    });
}
// ================= SEARCH =================
function setupSearch() {
    const mainBtn = document.getElementById('main-search-btn');
    const topBtn = document.getElementById('top-search-btn');

    if (mainBtn) mainBtn.onclick = () => handleSearch('main');
    if (topBtn) topBtn.onclick = () => handleSearch('top');

    ['main-search-input', 'top-search-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onkeydown = (e) => {
                if (e.key === 'Enter') handleSearch(id.split('-')[0]);
            };
        }
    });
}
// ================= AUTO-COMPLETE (Version Immédiate) =================
function setupAutocomplete(source) {
    const input = document.getElementById(`${source}-search-input`);
    const box = document.getElementById(`${source}-search-box`) || document.getElementById('main-search-box');
    if (!input || !box) return;

    // Création du menu (s'il n'existe pas déjà)
    let dropdown = box.querySelector('.search-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'search-dropdown';
        box.appendChild(dropdown);
    }

    // Fonction pour mettre à jour la liste affichée
    const updateDropdown = () => {
        const val = input.value.trim().toLowerCase();
        const currentHistory = JSON.parse(localStorage.getItem('pss_history') || '[]');
        
        let matches;
        if (!val) {
            // Si la barre est vide : on affiche les 10 derniers profils consultés
            matches = currentHistory.slice(0, 10);
        } else {
            // Si on écrit : on filtre par nom ou par tag
            matches = currentHistory.filter(h => 
                h.name.toLowerCase().includes(val) || h.tag.toLowerCase().includes(val)
            );
        }

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = matches.map(m => `
            <div class="suggestion-item" onclick="goToProfile('${m.name}', '${m.tag}', '${m.region}')">
                <img class="sugg-icon" src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION || '14.11.1'}/img/profileicon/${m.iconId}.png">
                <div class="sugg-info">
                    <span class="sugg-name">${m.name}</span>
                    <span class="sugg-tag">#${m.tag}</span>
                </div>
                <span class="sugg-region">${m.region.toUpperCase()}</span>
            </div>
        `).join('');

        dropdown.style.display = 'flex';
    };

    // Événement : Quand on écrit
    input.addEventListener('input', updateDropdown);

    // Événement : Dès qu'on clique ou qu'on entre dans la barre
    input.addEventListener('focus', updateDropdown);

    // Cacher le menu si on clique ailleurs sur la page
    document.addEventListener('click', (e) => {
        if (!box.contains(e.target)) dropdown.style.display = 'none';
    });
}

function saveToHistory(name, tag, region, iconId) {
    let history = JSON.parse(localStorage.getItem('pss_history') || '[]');
    // On retire le joueur s'il existe déjà pour le remettre tout en haut (récent)
    history = history.filter(h => !(h.name.toLowerCase() === name.toLowerCase() && h.tag.toLowerCase() === tag.toLowerCase()));
    history.unshift({ name, tag, region, iconId });
    if (history.length > 20) history.pop(); // On garde les 20 derniers
    localStorage.setItem('pss_history', JSON.stringify(history));
}

function handleSearch(source = 'main') {
    const input = document.getElementById(`${source}-search-input`);
    if (!input) return;

    // Si le sélecteur de région n'existe plus, on force "euw1" par défaut
    const regionSelect = document.getElementById(`${source}-region-select`);
    const region = regionSelect ? regionSelect.value : 'euw1';

    const value = input.value.trim();

    if (!value.includes('#')) {
        alert("Format : Pseudo#TAG");
        return;
    }

    const encoded = encodeURIComponent(value);
    window.location.href = `profile.html?summoner=${encoded}&region=${region}`;
}

// ================= PROFILE =================
async function initProfilePage() {
    const params = new URLSearchParams(window.location.search);
    const summonerParam = params.get('summoner');
    const region = params.get('region') || 'euw1';

    if (!summonerParam) return;

    const [name, tag] = decodeURIComponent(summonerParam).split('#');
    const routing = ['euw1','eun1','tr1','ru'].includes(region) ? 'europe' : 'americas';

    const loader = document.getElementById('loading-overlay');
    loader?.classList.remove('hidden');

    try {
        const account = await riotFetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${name}/${tag}`);
        const summoner = await riotFetch(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`);
        
        console.log("🔍 Données Summoner reçues de Riot :", summoner);

        let rankedData = null;
        try {
            rankedData = await riotFetch(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`);
        } catch (e) {
            console.warn("Erreur LP (Joueur non classé ou erreur Riot) :", e);
        }

        document.getElementById('summoner-name').textContent = account.gameName;
        document.getElementById('summoner-tag').textContent = `#${account.tagLine}`;
        document.getElementById('summoner-region').textContent = region.toUpperCase();
        document.getElementById('summoner-level').textContent = summoner.summonerLevel;
        document.getElementById('summoner-icon').src =
            `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${summoner.profileIconId}.png`;

        // --- AFFICHAGE DU RANG ET DES LP ACTUELS ---
        const ranksDiv = document.getElementById('summoner-ranks');
        if (ranksDiv) {
            const soloQ = rankedData?.find(r => r.queueType === "RANKED_SOLO_5x5");
            if (soloQ) {
                const winrate = Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100);
                
                const rankIconUrl = `/ranks/Emblem_${soloQ.tier.toUpperCase()}.png`;

                ranksDiv.innerHTML = `
                    <div class="rank-card">
                        <img src="${rankIconUrl}" alt="${soloQ.tier}" class="rank-icon-img" />
                        <div class="rank-info-text">
                            <span class="rank-queue">Classé Solo</span>
                            <span class="rank-tier tier-${soloQ.tier}">${soloQ.tier} ${soloQ.rank}</span>
                            <span class="rank-lp">${soloQ.leaguePoints} LP</span>
                            <span class="rank-wr">${soloQ.wins}V ${soloQ.losses}D (${winrate}%)</span>
                        </div>
                    </div>
                `;
            } else {
                ranksDiv.innerHTML = `<div class="rank-card"><span class="rank-queue">Non Classé</span></div>`;
            }
        }

        // L'ancienne sauvegarde locale (pour l'ordinateur de l'utilisateur)
        saveToHistory(account.gameName, account.tagLine, region, summoner.profileIconId);
        
        // NOUVEAU : On sauvegarde sur le serveur !
        saveToDatabase(account, summoner, region, rankedData);

        await loadMatchHistory(account.puuid, routing);

    } catch (e) {
        console.error(e);
        document.getElementById('summoner-name').textContent = "Introuvable";
    } finally {
        loader?.classList.add('hidden');
    }
}

// ================= MATCH HISTORY =================
async function loadMatchHistory(puuid, routing) {
    const list = document.getElementById('match-list');
    if(list) list.innerHTML = '';

    // 1. On récupère TON historique de LP depuis ta base de données SQLite
    let lpHistory = [];
    try {
        const lpRes = await fetch(`/api/getLpHistory/${puuid}`);
        lpHistory = await lpRes.json();
    } catch (e) { console.error("Erreur chargement historique LP", e); }

    // 2. On récupère les matchs Riot
    const ids = await riotFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=10`);

    // NOUVEAU : Un "panier" pour se souvenir des records de LP déjà affichés
    let usedLpRecords = new Set();

    for (const id of ids) {
        const match = await riotFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`);
        // On passe 'usedLpRecords' à la fonction pour qu'elle le lise et le modifie
        renderMatchBanner(match, puuid, lpHistory, usedLpRecords); 
    }
}

// ================= HELPERS =================
function getChampionImg(name) {
    return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${name}.png`;
}

// NOUVEAU : Helper pour récupérer l'image de la rune
function getRuneImg(id) {
    const path = RUNES_MAP[id];
    if (!path) return '';
    // Attention : l'URL des runes est légèrement différente des items !
    return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
}

// Convertit un rang (ex: GOLD IV 90LP) en un score numérique global pour faire des maths
function getAbsoluteLp(tier, rank, lp) {
    const TIERS = {
        "IRON": 0, "BRONZE": 400, "SILVER": 800, "GOLD": 1200,
        "PLATINUM": 1600, "EMERALD": 2000, "DIAMOND": 2400,
        "MASTER": 2800, "GRANDMASTER": 2800, "CHALLENGER": 2800
    };
    const DIVISIONS = { "IV": 0, "III": 100, "II": 200, "I": 300 };

    const t = TIERS[tier.toUpperCase()] || 0;
    const d = DIVISIONS[rank.toUpperCase()] || 0;
    return t + d + lp;
}

function getSpellImg(id) {
    const spell = SPELLS_MAP[id];
    if (!spell) return '';
    return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${spell}.png`;
}

// ================= RENDER MATCH =================
function renderMatchBanner(match, puuid, lpHistory, usedLpRecords) {
    const p = match.info.participants.find(x => x.puuid === puuid);
    const win = p.win;
    const matchId = match.metadata.matchId;

    const team1 = match.info.participants.slice(0,5);
    const team2 = match.info.participants.slice(5,10);

    // --- CALCUL DES LP INTELLIGENT (VERSION ULTIME) ---
    let lpDisplay = `<span class="lp-na">-</span>`;
    
    if (match.info.queueId === 420 && lpHistory && lpHistory.length > 1) {
        const gameEnd = match.info.gameEndTimestamp;

        // On trie du plus ancien au plus récent pour trouver le premier point APRES la game
        const historyAsc = [...lpHistory].reverse();
        const recordApres = historyAsc.find(r => r.timeMs > gameEnd);

        // Si on a un point après la game, ET qu'on ne l'a pas déjà "consommé" sur une game plus récente
        if (recordApres && !usedLpRecords.has(recordApres.timeMs)) {
            
            // On retrouve l'index dans le tableau original (DESC) pour choper le point "Avant"
            const indexApres = lpHistory.indexOf(recordApres);
            const recordAvant = lpHistory[indexApres + 1];

            // On s'assure que le point 'Avant' a bien été pris AVANT la game
            if (recordAvant && gameEnd > recordAvant.timeMs) {
                // On consomme ce record pour les prochaines games de la boucle !
                usedLpRecords.add(recordApres.timeMs);

                // On utilise notre convertisseur magique
                const absApres = getAbsoluteLp(recordApres.tier, recordApres.rank, recordApres.lp);
                const absAvant = getAbsoluteLp(recordAvant.tier, recordAvant.rank, recordAvant.lp);
                const diff = absApres - absAvant;

                if (diff > 0) lpDisplay = `<span class="lp-change gain">+${diff} LP</span>`;
                else if (diff < 0) lpDisplay = `<span class="lp-change loss">${diff} LP</span>`;
                else lpDisplay = `<span class="lp-change">0 LP</span>`;
            }
        }
    }
    const html = `
    <div class="match-wrapper">

        <div class="match-banner ${win ? 'win' : 'loss'}" onclick="toggleMatch('${matchId}')">

            <!-- INFO -->
            <div class="m-col info">
                <div class="m-result">${win ? 'Victoire' : 'Défaite'}</div>
                <div>${Math.floor(match.info.gameDuration / 60)}m</div>
            </div>

            <!-- CHAMP + SPELLS -->
            <div class="m-col champ">
                <div class="champ-wrap">
                    <img src="${getChampionImg(p.championName)}"
                         onerror="this.style.display='none'"
                         class="m-champ-img">

                    <div class="m-spells-runes">
                        <div class="col-spells">
                            <img src="${getSpellImg(p.summoner1Id)}" class="spell-img">
                            <img src="${getSpellImg(p.summoner2Id)}" class="spell-img">
                        </div>
                        <div class="col-runes">
                            <img src="${getRuneImg(p.perks.styles[0].selections[0].perk)}" class="rune-img">
                            <img src="${getRuneImg(p.perks.styles[1].style)}" class="rune-img secondary-rune">
                        </div>
                    </div>
                </div>
            </div>

            <!-- KDA -->
            <div class="m-col kda">
                <div class="kda-values">
                    <span class="k">${p.kills}</span> /
                    <span class="d">${p.deaths}</span> /
                    <span class="a">${p.assists}</span>
                </div>
                <div class="kda-ratio">
                    ${((p.kills+p.assists)/Math.max(1,p.deaths)).toFixed(2)} KDA
                </div>
            </div>

            <!-- ITEMS -->
            <div class="m-col items">
                <div class="items-grid">
                    ${[p.item0,p.item1,p.item2,p.item3,p.item4,p.item5].map(id =>
                        id ? `<img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png">`
                           : `<div class="empty-item"></div>`
                    ).join('')}
                </div>
            </div>

            <!-- PLAYERS -->
            <div class="m-col players">
                <div class="team">
                    ${team1.map(tp => `
                        <div class="p-item" onclick="event.stopPropagation(); goToProfile('${tp.riotIdGameName}','${tp.riotIdTagline}')">
                            <img src="${getChampionImg(tp.championName)}">
                            <span>${tp.riotIdGameName}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="team">
                    ${team2.map(tp => `
                        <div class="p-item" onclick="event.stopPropagation(); goToProfile('${tp.riotIdGameName}','${tp.riotIdTagline}')">
                            <img src="${getChampionImg(tp.championName)}">
                            <span>${tp.riotIdGameName}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="m-col players">
                </div>

            <div class="m-col match-lp-col" style="min-width: 60px; text-align: right;">
                ${lpDisplay}
            </div>

        </div>

        <div class="match-details" id="details-${matchId}"></div>
    </div>
    `;

    document.getElementById('match-list').insertAdjacentHTML('beforeend', html);
}

// ================= TOGGLE =================
function toggleMatch(id) {
    const el = document.getElementById(`details-${id}`);

    if (el.classList.contains('open')) {
        el.classList.remove('open');
        el.innerHTML = '';
        return;
    }

    el.classList.add('open');
    loadMatchDetails(id, el);
}

// ================= REDIRECT =================
function goToProfile(name, tag, regionOverride) {
    const region = regionOverride || document.getElementById('top-region-select')?.value || 'euw1';
    const encoded = encodeURIComponent(`${name}#${tag}`);
    window.location.href = `profile.html?summoner=${encoded}&region=${region}`;
}

// ================= START =================
document.addEventListener('DOMContentLoaded', init);

async function loadMatchDetails(matchId, container) {
    try {
        const routing = 'europe'; // adapte si besoin
        const match = await riotFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`);

        const team1 = match.info.participants.slice(0, 5);
        const team2 = match.info.participants.slice(5, 10);

        container.innerHTML = `
            <div class="details-wrapper">
                
                <div class="details-team">
                    ${team1.map(p => renderPlayerRow(p)).join('')}
                </div>

                <div class="details-team">
                    ${team2.map(p => renderPlayerRow(p)).join('')}
                </div>

            </div>
        `;
    } catch (e) {
        container.innerHTML = `<p style="color:red;">Erreur chargement</p>`;
    }
}

function renderPlayerRow(p) {
    return `
        <div class="details-player" onclick="goToProfile('${p.riotIdGameName}','${p.riotIdTagline}')">

            <div class="dp-champ-wrap">
                <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${p.championName}.png" class="dp-champ">
                <div class="dp-spells-runes">
                    <img src="${getSpellImg(p.summoner1Id)}">
                    <img src="${getRuneImg(p.perks.styles[0].selections[0].perk)}" class="dp-rune">
                    <img src="${getSpellImg(p.summoner2Id)}">
                    <img src="${getRuneImg(p.perks.styles[1].style)}" class="dp-rune secondary-rune">
                </div>
            </div>

            <span class="dp-name">${p.riotIdGameName}</span>

            <span class="dp-kda">
                ${p.kills}/${p.deaths}/${p.assists}
            </span>

            <div class="dp-items">
                ${[p.item0,p.item1,p.item2,p.item3,p.item4,p.item5].map(id =>
                    id ? `<img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png">` : ''
                ).join('')}
            </div>

        </div>
    `;
}

// ================= DATABASE (SQLite) =================
async function saveToDatabase(account, summoner, region, rankedData) {
    try {
        // 1. Sauvegarder le profil dans l'annuaire global
        await fetch('/api/savePlayer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                puuid: account.puuid,
                summoner_id: summoner.id || account.puuid, // <-- MODIFIE CETTE LIGNE ICI (Plan B)
                gameName: account.gameName,
                tagLine: account.tagLine,
                region: region,
                profileIconId: summoner.profileIconId
            })
        });

        // 2. Sauvegarder les LP actuels (S'il joue en classé)
        const soloQ = rankedData?.find(r => r.queueType === "RANKED_SOLO_5x5");
        if (soloQ) {
            await fetch('/api/saveLp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    puuid: account.puuid,
                    tier: soloQ.tier,
                    rank: soloQ.rank,
                    lp: soloQ.leaguePoints
                })
            });
        }
    } catch (e) {
        console.error("Erreur de sauvegarde en base de données :", e);
    }
}

async function initLeaderboardPage() {
    const body = document.getElementById('leaderboard-body');
    if (!body) return;

    try {
        const res = await fetch('/api/leaderboard');
        let players = await res.json();

        // Calcul des LP absolus pour le tri
        players = players.map(p => ({
            ...p,
            absLp: p.tier ? getAbsoluteLp(p.tier, p.rank, p.lp) : -1
        }));

        // Tri décroissant
        players.sort((a, b) => b.absLp - a.absLp);

        body.innerHTML = players.map((p, index) => `
            <tr onclick="goToProfile('${p.gameName}', '${p.tagLine}')">
                <td>${index + 1}</td>
                <td class="player-cell">
                    <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${p.profileIconId}.png">
                    <span>${p.gameName} <small style="color:gray">#${p.tagLine}</small></span>
                </td>
                <td>
                    <img src="/ranks/Emblem_${p.tier ? p.tier.toUpperCase() : 'UNRANKED'}.png" class="mini-rank">
                    ${p.tier || 'N/A'} ${p.rank || ''}
                </td>
                <td>${p.lp !== null ? p.lp + ' LP' : '-'}</td>
                <td class="abs-lp-cell">${p.absLp > -1 ? p.absLp : 0}</td>
            </tr>
        `).join('');

    } catch (e) {
        console.error("Erreur Leaderboard:", e);
    }
}

// ================= LEADERBOARD BP =================
async function initBPLeaderboardPage() {
    const body = document.getElementById('leaderboard-bp-body');
    if (!body) return;

    try {
        const res = await fetch('/api/leaderboard-bp');
        let players = await res.json();

        if (players.length === 0) {
            body.innerHTML = '<tr><td colspan="3" style="text-align: center;">Aucun joueur n\'a de Bet Points.</td></tr>';
            return;
        }

        body.innerHTML = players.map((p, index) => {
            // --- LOGIQUE D'AFFICHAGE AMÉLIORÉE ---
            let playerDisplay = "";
            
            if (p.gameName) {
                // S'il a une icône (joueur déjà venu sur le site)
                if (p.profileIconId) {
                    playerDisplay = `
                        <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${p.profileIconId}.png">
                        <span>${p.gameName} <small style="color:gray">#${p.tagLine || ''}</small></span>`;
                } else {
                    // S'il a juste un nom (enregistré par le Bot via Discord)
                    playerDisplay = `
                        <div style="display: inline-block; width: 28px; height: 28px; background: #374151; border-radius: 4px; vertical-align: middle; margin-right: 10px; text-align: center; line-height: 28px; font-size: 12px; color: #fbbf24;">?</div>
                        <span style="color: #fff;">${p.gameName}</span>`;
                }
            } else {
                // Cas par défaut (uniquement l'ID)
                playerDisplay = `<span style="color:gray">ID Discord: ${p.discord_id}</span>`;
            }

            // On met le top 3 en couleur or/argent/bronze
            let rankStyle = "";
            if (index === 0) rankStyle = "color: #fbbf24; font-size: 1.2em; font-weight: bold;";
            if (index === 1) rankStyle = "color: #9ca3af; font-size: 1.1em; font-weight: bold;";
            if (index === 2) rankStyle = "color: #b45309; font-size: 1.05em; font-weight: bold;";

            return `
            <tr ${p.gameName && p.tagLine ? `onclick="goToProfile('${p.gameName}', '${p.tagLine}')" style="cursor:pointer;"` : ''}>
                <td style="${rankStyle}">${index + 1}</td>
                <td class="player-cell">
                    ${playerDisplay}
                </td>
                <td style="color: #fbbf24; font-weight: bold; font-size: 1.1em; letter-spacing: 1px;">
                    ${p.bet_points ? p.bet_points.toLocaleString() : 0} BP
                </td>
            </tr>
            `;
        }).join('');

    } catch (e) {
        console.error("Erreur Leaderboard BP:", e);
        body.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #ff4444;">Erreur serveur.</td></tr>';
    }
}