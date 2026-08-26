const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });
const lobbies = new Map();
const MAX_PLAYERS = 4;

function generateCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code;
    do {
        code = "";
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (lobbies.has(code));
    return code;
}

function findPlayer(lobby, name) {
    if (!lobby) return null;
    return lobby.players.find(p => p.name === name);
}

function findPlayerBySocket(lobby, socket) {
    if (!lobby) return null;
    return lobby.players.find(p => p.socket === socket);
}

function countPlayers(lobby) {
    if (!lobby) return 0;
    return lobby.players.filter(p => p.role === "PLAYER").length;
}

function countSpectators(lobby) {
    if (!lobby) return 0;
    return lobby.players.filter(p => p.role === "SPECTATOR").length;
}

function setHost(lobby, newHost) {
    if (!lobby || !newHost) return;

    lobby.host = newHost.socket;

    for (const player of lobby.players) {
        const isNewHost = player.socket === newHost.socket;
        player.is_host = isNewHost;
        player.socket.isHost = isNewHost;

        if (isNewHost) {
            player.role = "PLAYER";
            player.socket.role = "PLAYER";
        }
    }

    newHost.playing = false;
    newHost.ready = false;

    console.log("HOST UPDATED:", newHost.name);
}

function getPlayersList(lobby) {
    if (!lobby) return [];

    return lobby.players.map(player => ({
        name: player.name,
        role: player.role,
        is_host: player.is_host,
        ready: Boolean(player.ready),
        playing: Boolean(player.playing)
    }));
}

function broadcastLobby(lobby, code) {
    if (!lobby) return;

    const message = JSON.stringify({
        type: "lobby_update",
        lobby_code: code,
        players: getPlayersList(lobby)
    });

    for (const player of lobby.players) {
        if (player.socket.readyState === WebSocket.OPEN) {
            player.socket.send(message);
        }
    }

    console.log(
        "LOBBY UPDATE:",
        code,
        "| PLAYERS:",
        countPlayers(lobby),
        "| SPECTATORS:",
        countSpectators(lobby)
    );
}

function removePlayerFromLobby(lobby, socket) {
    if (!lobby) return;
    lobby.players = lobby.players.filter(p => p.socket !== socket);
}

function resetSocket(socket) {
    socket.lobbyCode = null;
    socket.playerName = "";
    socket.role = "PLAYER";
    socket.isHost = false;
}

function sendError(socket, type, reason) {
    if (socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({
        type: type,
        reason: reason
    }));
}

wss.on("connection", socket => {
    console.log("PLAYER CONNECTED");

    socket.lobbyCode = null;
    socket.playerName = "";
    socket.role = "PLAYER";
    socket.isHost = false;

    socket.on("message", message => {
        try {
            const data = JSON.parse(message);
            if (!data || !data.type) return;

            // ==================================================
            // CREATE LOBBY
            // ==================================================
            if (data.type === "create_lobby") {
                if (socket.lobbyCode) {
                    sendError(socket, "error", "ALREADY_IN_LOBBY");
                    return;
                }

                const code = generateCode();
                const playerName = String(data.player_name || "Player").trim();

                const hostPlayer = {
                    socket: socket,
                    name: playerName,
                    role: "PLAYER",
                    is_host: true,
                    ready: false,
                    playing: false
                };

                const lobby = {
                    host: socket,
                    players: [hostPlayer]
                };

                lobbies.set(code, lobby);

                socket.lobbyCode = code;
                socket.playerName = playerName;
                socket.role = "PLAYER";
                socket.isHost = true;

                socket.send(JSON.stringify({
                    type: "lobby_created",
                    lobby_code: code,
                    player_name: playerName,
                    role: "PLAYER",
                    is_host: true
                }));

                console.log("LOBBY CREATED:", code, "| HOST:", playerName);
                return;
            }

            // ==================================================
            // JOIN LOBBY
            // ==================================================
            if (data.type === "join_lobby") {
                if (socket.lobbyCode) {
                    sendError(socket, "join_failed", "ALREADY_IN_LOBBY");
                    return;
                }

                const code = String(data.lobby_code || "").trim().toUpperCase();
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "join_failed", "INVALID_CODE");
                    return;
                }

                if (countPlayers(lobby) >= MAX_PLAYERS) {
                    sendError(socket, "join_failed", "LOBBY_FULL");
                    return;
                }

                const playerName = String(data.player_name || "Player").trim();

                if (findPlayer(lobby, playerName)) {
                    sendError(socket, "join_failed", "NAME_ALREADY_IN_LOBBY");
                    return;
                }

                const newPlayer = {
                    socket: socket,
                    name: playerName,
                    role: "PLAYER",
                    is_host: false,
                    ready: false,
                    playing: false
                };

                lobby.players.push(newPlayer);

                socket.lobbyCode = code;
                socket.playerName = playerName;
                socket.role = "PLAYER";
                socket.isHost = false;

                socket.send(JSON.stringify({
                    type: "join_success",
                    lobby_code: code,
                    players: getPlayersList(lobby)
                }));

                for (const player of lobby.players) {
                    if (
                        player.socket !== socket &&
                        player.socket.readyState === WebSocket.OPEN
                    ) {
                        player.socket.send(JSON.stringify({
                            type: "player_joined",
                            lobby_code: code,
                            player_name: playerName,
                            role: "PLAYER",
                            is_host: false
                        }));
                    }
                }

                broadcastLobby(lobby, code);
                return;
            }

            // ==================================================
            // CHANGE ROLE
            // ==================================================
            if (data.type === "change_role") {
                const code = socket.lobbyCode;
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "role_change_failed", "NOT_IN_LOBBY");
                    return;
                }

                const requestingPlayer = findPlayerBySocket(lobby, socket);

                if (!requestingPlayer) {
                    sendError(socket, "role_change_failed", "PLAYER_NOT_FOUND");
                    return;
                }

                const newRole = data.role;

                if (newRole !== "PLAYER" && newRole !== "SPECTATOR") {
                    sendError(socket, "role_change_failed", "INVALID_ROLE");
                    return;
                }

                // HOST ĐỔI ROLE NGƯỜI KHÁC
                if (socket === lobby.host) {
                    const targetPlayer = findPlayer(lobby, data.player_name);

                    if (!targetPlayer) {
                        sendError(socket, "role_change_failed", "PLAYER_NOT_FOUND");
                        return;
                    }

                    if (
                        targetPlayer.socket === lobby.host &&
                        newRole === "SPECTATOR"
                    ) {
                        sendError(socket, "role_change_failed", "HOST_CANNOT_BE_SPECTATOR");
                        return;
                    }

                    if (
                        newRole === "PLAYER" &&
                        targetPlayer.role === "SPECTATOR" &&
                        countPlayers(lobby) >= MAX_PLAYERS
                    ) {
                        sendError(socket, "role_change_failed", "PLAYER_SLOTS_FULL");
                        return;
                    }

                    targetPlayer.role = newRole;
                    targetPlayer.socket.role = newRole;
                    targetPlayer.ready = false;

                    // SPECTATOR KHÔNG THỂ PLAYING
                    if (newRole === "SPECTATOR") {
                        targetPlayer.playing = false;
                    }

                    broadcastLobby(lobby, code);
                    return;
                }

                // PLAYER/SPECTATOR TỰ ĐỔI ROLE
                if (data.player_name !== requestingPlayer.name) {
                    sendError(socket, "role_change_failed", "ONLY_CHANGE_SELF");
                    return;
                }

                if (
                    socket === lobby.host &&
                    newRole === "SPECTATOR"
                ) {
                    sendError(socket, "role_change_failed", "HOST_CANNOT_BE_SPECTATOR");
                    return;
                }

                if (
                    newRole === "PLAYER" &&
                    requestingPlayer.role === "SPECTATOR" &&
                    countPlayers(lobby) >= MAX_PLAYERS
                ) {
                    sendError(socket, "role_change_failed", "PLAYER_SLOTS_FULL");
                    return;
                }

                requestingPlayer.role = newRole;
                socket.role = newRole;
                requestingPlayer.ready = false;

                if (newRole === "SPECTATOR") {
                    requestingPlayer.playing = false;
                }

                broadcastLobby(lobby, code);
                return;
            }

            // ==================================================
            // START GAME
            // ==================================================
            if (data.type === "start_game") {
                const code = socket.lobbyCode;
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "start_game_failed", "NOT_IN_LOBBY");
                    return;
                }

                if (lobby.host !== socket) {
                    sendError(socket, "start_game_failed", "NOT_HOST");
                    return;
                }

                if (countPlayers(lobby) <= 0) {
                    sendError(socket, "start_game_failed", "NO_PLAYERS");
                    return;
                }

                // TẤT CẢ PLAYER ĐƯỢC ĐÁNH DẤU PLAYING
                // SPECTATOR KHÔNG PLAYING
                for (const player of lobby.players) {
                    if (player.role === "PLAYER") {
                        player.playing = true;
                        player.ready = false;
                    } else {
                        player.playing = false;
                        player.ready = false;
                    }
                }

                broadcastLobby(lobby, code);

                const startMessage = JSON.stringify({
                    type: "start_game",
                    lobby_code: code
                });

                for (const player of lobby.players) {
                    if (player.socket.readyState === WebSocket.OPEN) {
                        player.socket.send(startMessage);
                    }
                }

                console.log(
                    "GAME STARTED:",
                    code,
                    "| PLAYERS:",
                    countPlayers(lobby)
                );

                return;
            }

            // ==================================================
            // GAME STATUS
            //
            // PLAYING = ĐANG Ở MAIN.TSCN
            // WAITING = ĐÃ QUAY VỀ LOBBY
            //
            // KHÔNG LIÊN QUAN ĐẾN CHẾT.
            // ==================================================
            if (data.type === "game_status") {
                const code = socket.lobbyCode;
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "game_status_failed", "NOT_IN_LOBBY");
                    return;
                }

                const player = findPlayerBySocket(lobby, socket);

                if (!player) {
                    sendError(socket, "game_status_failed", "PLAYER_NOT_FOUND");
                    return;
                }

                if (player.role !== "PLAYER") {
                    player.playing = false;
                    player.ready = false;
                    broadcastLobby(lobby, code);
                    return;
                }

                const status = String(data.status || "").toUpperCase();

                if (status === "PLAYING") {
                    player.playing = true;
                    player.ready = false;
                } else if (status === "WAITING") {
                    player.playing = false;
                    player.ready = false;
                }

                console.log(
                    "GAME STATUS:",
                    player.name,
                    "->",
                    player.playing ? "PLAYING" : "WAITING"
                );

                broadcastLobby(lobby, code);
                return;
            }

            // ==================================================
            // KICK
            // ==================================================
            if (data.type === "kick_player") {
                const code = socket.lobbyCode;
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "kick_failed", "NOT_IN_LOBBY");
                    return;
                }

                if (lobby.host !== socket) {
                    sendError(socket, "kick_failed", "NOT_HOST");
                    return;
                }

                const targetPlayer = findPlayer(lobby, data.player_name);

                if (!targetPlayer) {
                    sendError(socket, "kick_failed", "PLAYER_NOT_FOUND");
                    return;
                }

                const targetSocket = targetPlayer.socket;

                if (targetSocket === lobby.host) {
                    sendError(socket, "kick_failed", "CANNOT_KICK_HOST");
                    return;
                }

                removePlayerFromLobby(lobby, targetSocket);

                if (targetSocket.readyState === WebSocket.OPEN) {
                    targetSocket.send(JSON.stringify({
                        type: "kicked_from_lobby",
                        reason: "KICKED_BY_HOST"
                    }));
                }

                resetSocket(targetSocket);

                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: "kick_success",
                        player_name: targetPlayer.name
                    }));
                }

                if (lobby.players.length > 0) {
                    broadcastLobby(lobby, code);
                } else {
                    lobbies.delete(code);
                }

                return;
            }

            // ==================================================
            // READY
            // ==================================================
            if (data.type === "ready_change") {
                const code = socket.lobbyCode;
                const lobby = lobbies.get(code);

                if (!lobby) {
                    sendError(socket, "ready_change_failed", "NOT_IN_LOBBY");
                    return;
                }

                const player = findPlayerBySocket(lobby, socket);

                if (!player) {
                    sendError(socket, "ready_change_failed", "PLAYER_NOT_FOUND");
                    return;
                }

                if (player.role !== "PLAYER") {
                    sendError(socket, "ready_change_failed", "SPECTATOR_CANNOT_READY");
                    return;
                }

                if (player.playing) {
                    sendError(socket, "ready_change_failed", "PLAYER_ALREADY_PLAYING");
                    return;
                }

                player.ready = Boolean(data.ready);

                broadcastLobby(lobby, code);
                return;
            }

            console.log("UNKNOWN MESSAGE TYPE:", data.type);

        } catch (error) {
            console.log("INVALID MESSAGE:", error);
        }
    });

    // ==================================================
    // DISCONNECT
    // ==================================================
    socket.on("close", () => {
        console.log("PLAYER DISCONNECTED:", socket.playerName);

        const code = socket.lobbyCode;
        if (!code) return;

        const lobby = lobbies.get(code);
        if (!lobby) return;

        const player = findPlayerBySocket(lobby, socket);
        if (!player) return;

        // HOST THOÁT
        if (lobby.host === socket) {
            removePlayerFromLobby(lobby, socket);
            resetSocket(socket);

            // CÒN NGƯỜI -> GIỮ LOBBY
            if (lobby.players.length > 0) {
                let newHost = lobby.players.find(
                    p => p.role === "PLAYER"
                );

                if (!newHost) {
                    newHost = lobby.players[0];
                }

                setHost(lobby, newHost);
                broadcastLobby(lobby, code);

                console.log(
                    "HOST LEFT. NEW HOST:",
                    newHost.name,
                    "| LOBBY KEPT:",
                    code
                );
            } else {
                // KHÔNG CÒN AI -> XÓA LOBBY
                lobbies.delete(code);
                console.log("LOBBY DELETED:", code);
            }

            return;
        }

        // PLAYER / SPECTATOR THOÁT
        removePlayerFromLobby(lobby, socket);
        resetSocket(socket);

        // CÒN NGƯỜI -> GIỮ LOBBY
        if (lobby.players.length > 0) {
            broadcastLobby(lobby, code);
            console.log(
                "PLAYER LEFT. LOBBY KEPT:",
                code
            );
        } else {
            // KHÔNG CÒN AI -> XÓA LOBBY
            lobbies.delete(code);
            console.log("LOBBY DELETED:", code);
        }
    });
});

console.log("Lobby server running on port", port);
