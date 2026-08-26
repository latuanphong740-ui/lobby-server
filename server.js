const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();

const MAX_PLAYERS = 4;

// ==================================================
// RECONNECT SETTINGS
// ==================================================

// Khi mất kết nối, người chơi vẫn được giữ trong lobby
// trong khoảng thời gian này để có thể reconnect.
const RECONNECT_GRACE_TIME = 5 * 60 * 1000; // 5 phút


// ==================================================
// GENERATE CODE
// ==================================================

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


// ==================================================
// GENERATE PLAYER ID
// ==================================================

function generatePlayerId() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 10)
    ).toUpperCase();
}


// ==================================================
// FIND PLAYER
// ==================================================

function findPlayer(lobby, name) {
    if (!lobby) return null;

    return lobby.players.find(
        p => p.name === name
    );
}


function findPlayerById(lobby, playerId) {
    if (!lobby) return null;

    return lobby.players.find(
        p => p.player_id === playerId
    );
}


function findPlayerBySocket(lobby, socket) {
    if (!lobby) return null;

    return lobby.players.find(
        p => p.socket === socket
    );
}


// ==================================================
// COUNT
// ==================================================

function countPlayers(lobby) {
    if (!lobby) return 0;

    return lobby.players.filter(
        p => p.role === "PLAYER"
    ).length;
}


function countSpectators(lobby) {
    if (!lobby) return 0;

    return lobby.players.filter(
        p => p.role === "SPECTATOR"
    ).length;
}


// ==================================================
// ONLINE COUNT
// ==================================================

function countOnline(lobby) {
    if (!lobby) return 0;

    return lobby.players.filter(
        p =>
            p.socket &&
            p.socket.readyState === WebSocket.OPEN
    ).length;
}


// ==================================================
// SET HOST
// ==================================================

function setHost(lobby, newHost) {
    if (!lobby || !newHost) return;

    lobby.host = newHost.socket;

    for (const player of lobby.players) {

        const isNewHost =
            player.player_id === newHost.player_id;

        player.is_host = isNewHost;

        if (player.socket) {
            player.socket.isHost = isNewHost;
        }

        if (isNewHost) {
            player.role = "PLAYER";
        }
    }

    newHost.role = "PLAYER";
    newHost.ready = false;

    console.log(
        "HOST UPDATED:",
        newHost.name
    );
}


// ==================================================
// PLAYER LIST
// ==================================================

function getPlayersList(lobby) {

    if (!lobby) return [];

    return lobby.players.map(player => ({
        player_id: player.player_id,

        name: player.name,

        role: player.role,

        is_host: Boolean(player.is_host),

        ready: Boolean(player.ready),

        playing: Boolean(player.playing),

        connected: Boolean(
            player.socket &&
            player.socket.readyState === WebSocket.OPEN
        )
    }));
}


// ==================================================
// SEND TO SOCKET
// ==================================================

function sendToSocket(socket, data) {

    if (!socket) return;

    if (
        socket.readyState ===
        WebSocket.OPEN
    ) {
        socket.send(
            JSON.stringify(data)
        );
    }
}


// ==================================================
// SEND ERROR
// ==================================================

function sendError(
    socket,
    type,
    reason
) {

    sendToSocket(socket, {
        type: type,
        reason: reason
    });
}


// ==================================================
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(
    lobby,
    code
) {

    if (!lobby) return;

    const message = {
        type: "lobby_update",

        lobby_code: code,

        players: getPlayersList(lobby)
    };

    for (const player of lobby.players) {

        sendToSocket(
            player.socket,
            message
        );
    }

    console.log(
        "LOBBY UPDATE:",
        code,
        "| PLAYERS:",
        countPlayers(lobby),
        "| SPECTATORS:",
        countSpectators(lobby),
        "| ONLINE:",
        countOnline(lobby)
    );
}


// ==================================================
// REMOVE PLAYER
// ==================================================

function removePlayerFromLobby(
    lobby,
    player
) {

    if (!lobby || !player) return;

    lobby.players =
        lobby.players.filter(
            p =>
                p.player_id !==
                player.player_id
        );
}


// ==================================================
// RESET SOCKET
// ==================================================

function resetSocket(socket) {

    if (!socket) return;

    socket.lobbyCode = null;

    socket.playerName = "";

    socket.playerId = null;

    socket.role = "PLAYER";

    socket.isHost = false;
}


// ==================================================
// RECONNECT TOKEN INFO
// ==================================================

function createReconnectInfo(player) {

    return {
        player_id: player.player_id,

        lobby_code: player.lobby_code
    };
}


// ==================================================
// DISCONNECT TIMER
// ==================================================

function schedulePlayerRemoval(
    lobby,
    player
) {

    if (!lobby || !player) return;

    // Xóa timer cũ nếu có
    if (player.disconnect_timer) {

        clearTimeout(
            player.disconnect_timer
        );
    }

    player.disconnected_at =
        Date.now();

    player.disconnect_timer =
        setTimeout(() => {

            // Nếu đã reconnect thì không xóa
            if (
                player.socket &&
                player.socket.readyState ===
                WebSocket.OPEN
            ) {
                return;
            }

            const currentLobby =
                lobbies.get(
                    lobby.code
                );

            if (!currentLobby) {
                return;
            }

            const currentPlayer =
                findPlayerById(
                    currentLobby,
                    player.player_id
                );

            if (!currentPlayer) {
                return;
            }

            console.log(
                "RECONNECT TIMEOUT:",
                currentPlayer.name,
                "| LOBBY:",
                lobby.code
            );

            removePlayerFromLobby(
                currentLobby,
                currentPlayer
            );

            // Nếu người bị xóa là host
            if (
                currentLobby.host ===
                currentPlayer.socket
            ) {

                currentLobby.host = null;
            }

            // Chọn host mới nếu cần
            if (
                !currentLobby.host ||
                !currentLobby.players.some(
                    p =>
                        p.socket ===
                        currentLobby.host
                )
            ) {

                const newHost =
                    currentLobby.players.find(
                        p =>
                            p.role ===
                            "PLAYER" &&
                            p.socket &&
                            p.socket.readyState ===
                            WebSocket.OPEN
                    );

                if (newHost) {

                    setHost(
                        currentLobby,
                        newHost
                    );
                }
            }

            if (
                currentLobby.players.length ===
                0
            ) {

                lobbies.delete(
                    lobby.code
                );

                console.log(
                    "LOBBY DELETED:",
                    lobby.code
                );

            } else {

                broadcastLobby(
                    currentLobby,
                    lobby.code
                );
            }

        }, RECONNECT_GRACE_TIME);
}


// ==================================================
// CREATE LOBBY
// ==================================================

function createLobby(
    socket,
    playerName
) {

    const code =
        generateCode();

    const playerId =
        generatePlayerId();

    const hostPlayer = {

        player_id: playerId,

        name: playerName,

        socket: socket,

        lobby_code: code,

        role: "PLAYER",

        is_host: true,

        ready: false,

        playing: false,

        disconnected_at: null,

        disconnect_timer: null
    };

    const lobby = {

        code: code,

        host: socket,

        players: [
            hostPlayer
        ],

        created_at: Date.now()
    };

    lobbies.set(
        code,
        lobby
    );

    socket.lobbyCode = code;

    socket.playerName =
        playerName;

    socket.playerId =
        playerId;

    socket.role =
        "PLAYER";

    socket.isHost =
        true;

    sendToSocket(
        socket,
        {
            type: "lobby_created",

            lobby_code: code,

            player_name: playerName,

            player_id: playerId,

            role: "PLAYER",

            is_host: true
        }
    );

    console.log(
        "LOBBY CREATED:",
        code,
        "| HOST:",
        playerName,
        "| ID:",
        playerId
    );
}


// ==================================================
// JOIN LOBBY
// ==================================================

function joinLobby(
    socket,
    code,
    playerName
) {

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "join_failed",
            "INVALID_CODE"
        );

        return;
    }

    // Không cho join nếu đang ở lobby khác
    if (socket.lobbyCode) {

        sendError(
            socket,
            "join_failed",
            "ALREADY_IN_LOBBY"
        );

        return;
    }

    if (
        countPlayers(lobby) >=
        MAX_PLAYERS
    ) {

        sendError(
            socket,
            "join_failed",
            "LOBBY_FULL"
        );

        return;
    }

    // Không cho trùng tên
    const existing =
        findPlayer(
            lobby,
            playerName
        );

    if (existing) {

        sendError(
            socket,
            "join_failed",
            "NAME_ALREADY_IN_LOBBY"
        );

        return;
    }

    const playerId =
        generatePlayerId();

    const newPlayer = {

        player_id: playerId,

        name: playerName,

        socket: socket,

        lobby_code: code,

        role: "PLAYER",

        is_host: false,

        ready: false,

        playing: false,

        disconnected_at: null,

        disconnect_timer: null
    };

    lobby.players.push(
        newPlayer
    );

    socket.lobbyCode =
        code;

    socket.playerName =
        playerName;

    socket.playerId =
        playerId;

    socket.role =
        "PLAYER";

    socket.isHost =
        false;

    sendToSocket(
        socket,
        {
            type: "join_success",

            lobby_code: code,

            player_id: playerId,

            players:
                getPlayersList(lobby)
        }
    );

    // Thông báo player mới
    for (
        const player of
        lobby.players
    ) {

        if (
            player.player_id !==
            playerId
        ) {

            sendToSocket(
                player.socket,
                {
                    type: "player_joined",

                    lobby_code: code,

                    player_name:
                        playerName,

                    player_id:
                        playerId,

                    role: "PLAYER",

                    is_host: false
                }
            );
        }
    }

    broadcastLobby(
        lobby,
        code
    );

    console.log(
        "PLAYER JOINED:",
        playerName,
        "| LOBBY:",
        code
    );
}


// ==================================================
// RECONNECT LOBBY
// ==================================================

function reconnectLobby(
    socket,
    code,
    playerId,
    playerName
) {

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "reconnect_failed",
            "LOBBY_NOT_FOUND"
        );

        return;
    }

    const player =
        findPlayerById(
            lobby,
            playerId
        );

    if (!player) {

        sendError(
            socket,
            "reconnect_failed",
            "PLAYER_NOT_FOUND"
        );

        return;
    }

    // Nếu tên không khớp thì từ chối
    if (
        player.name !==
        playerName
    ) {

        sendError(
            socket,
            "reconnect_failed",
            "PLAYER_ID_NAME_MISMATCH"
        );

        return;
    }

    // Hủy timer xóa
    if (
        player.disconnect_timer
    ) {

        clearTimeout(
            player.disconnect_timer
        );

        player.disconnect_timer =
            null;
    }

    // Gắn socket mới
    player.socket =
        socket;

    player.disconnected_at =
        null;

    socket.lobbyCode =
        code;

    socket.playerName =
        player.name;

    socket.playerId =
        player.player_id;

    socket.role =
        player.role;

    socket.isHost =
        player.is_host;

    // Nếu người reconnect là host
    if (player.is_host) {

        lobby.host =
            socket;
    }

    sendToSocket(
        socket,
        {
            type: "reconnect_success",

            lobby_code: code,

            player_id:
                player.player_id,

            player_name:
                player.name,

            role:
                player.role,

            is_host:
                player.is_host,

            playing:
                player.playing,

            players:
                getPlayersList(lobby)
        }
    );

    broadcastLobby(
        lobby,
        code
    );

    console.log(
        "RECONNECTED:",
        player.name,
        "| LOBBY:",
        code
    );
}


// ==================================================
// CHANGE ROLE
// ==================================================

function changeRole(
    socket,
    data
) {

    const lobby =
        lobbies.get(
            socket.lobbyCode
        );

    if (!lobby) {

        sendError(
            socket,
            "role_change_failed",
            "NOT_IN_LOBBY"
        );

        return;
    }

    const requestingPlayer =
        findPlayerBySocket(
            lobby,
            socket
        );

    if (!requestingPlayer) {

        sendError(
            socket,
            "role_change_failed",
            "PLAYER_NOT_FOUND"
        );

        return;
    }

    const newRole =
        data.role;

    if (
        newRole !== "PLAYER" &&
        newRole !== "SPECTATOR"
    ) {

        sendError(
            socket,
            "role_change_failed",
            "INVALID_ROLE"
        );

        return;
    }

    // ==================================================
    // HOST ĐỔI ROLE NGƯỜI KHÁC
    // ==================================================

    if (
        socket === lobby.host
    ) {

        const targetPlayer =
            findPlayer(
                lobby,
                data.player_name
            );

        if (!targetPlayer) {

            sendError(
                socket,
                "role_change_failed",
                "PLAYER_NOT_FOUND"
            );

            return;
        }

        if (
            targetPlayer.player_id ===
            requestingPlayer.player_id &&
            newRole === "SPECTATOR"
        ) {

            sendError(
                socket,
                "role_change_failed",
                "HOST_CANNOT_BE_SPECTATOR"
            );

            return;
        }

        if (
            newRole === "PLAYER" &&
            targetPlayer.role === "SPECTATOR" &&
            countPlayers(lobby) >=
            MAX_PLAYERS
        ) {

            sendError(
                socket,
                "role_change_failed",
                "PLAYER_SLOTS_FULL"
            );

            return;
        }

        targetPlayer.role =
            newRole;

        targetPlayer.ready =
            false;

        if (
            newRole ===
            "SPECTATOR"
        ) {

            targetPlayer.playing =
                false;
        }

        if (targetPlayer.socket) {
            targetPlayer.socket.role =
                newRole;
        }

        broadcastLobby(
            lobby,
            socket.lobbyCode
        );

        return;
    }

    // ==================================================
    // PLAYER TỰ ĐỔI ROLE
    // ==================================================

    if (
        data.player_name !==
        requestingPlayer.name
    ) {

        sendError(
            socket,
            "role_change_failed",
            "ONLY_CHANGE_SELF"
        );

        return;
    }

    if (
        newRole === "PLAYER" &&
        requestingPlayer.role ===
        "SPECTATOR" &&
        countPlayers(lobby) >=
        MAX_PLAYERS
    ) {

        sendError(
            socket,
            "role_change_failed",
            "PLAYER_SLOTS_FULL"
        );

        return;
    }

    requestingPlayer.role =
        newRole;

    requestingPlayer.ready =
        false;

    if (
        newRole ===
        "SPECTATOR"
    ) {

        requestingPlayer.playing =
            false;
    }

    socket.role =
        newRole;

    broadcastLobby(
        lobby,
        socket.lobbyCode
    );
}


// ==================================================
// START GAME
// ==================================================

function startGame(socket) {

    const code =
        socket.lobbyCode;

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "start_game_failed",
            "NOT_IN_LOBBY"
        );

        return;
    }

    if (
        lobby.host !== socket
    ) {

        sendError(
            socket,
            "start_game_failed",
            "NOT_HOST"
        );

        return;
    }

    if (
        countPlayers(lobby) <= 0
    ) {

        sendError(
            socket,
            "start_game_failed",
            "NO_PLAYERS"
        );

        return;
    }

    // Tất cả PLAYER bắt đầu game
    for (
        const player of
        lobby.players
    ) {

        if (
            player.role ===
            "PLAYER"
        ) {

            player.playing =
                true;

            player.ready =
                false;

        } else {

            player.playing =
                false;

            player.ready =
                false;
        }
    }

    broadcastLobby(
        lobby,
        code
    );

    const message = {

        type: "start_game",

        lobby_code: code,

        players:
            getPlayersList(lobby)
    };

    for (
        const player of
        lobby.players
    ) {

        sendToSocket(
            player.socket,
            message
        );
    }

    console.log(
        "GAME STARTED:",
        code,
        "| PLAYERS:",
        countPlayers(lobby)
    );
}


// ==================================================
// GAME STATUS
// ==================================================

function gameStatus(
    socket,
    data
) {

    const code =
        socket.lobbyCode;

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "game_status_failed",
            "NOT_IN_LOBBY"
        );

        return;
    }

    const player =
        findPlayerBySocket(
            lobby,
            socket
        );

    if (!player) {

        sendError(
            socket,
            "game_status_failed",
            "PLAYER_NOT_FOUND"
        );

        return;
    }

    if (
        player.role !==
        "PLAYER"
    ) {

        player.playing =
            false;

        player.ready =
            false;

        broadcastLobby(
            lobby,
            code
        );

        return;
    }

    const status =
        String(
            data.status || ""
        ).toUpperCase();

    if (
        status ===
        "PLAYING"
    ) {

        player.playing =
            true;

        player.ready =
            false;

    } else if (
        status ===
        "WAITING"
    ) {

        player.playing =
            false;

        player.ready =
            false;
    }

    console.log(
        "GAME STATUS:",
        player.name,
        "->",
        player.playing
            ? "PLAYING"
            : "WAITING"
    );

    broadcastLobby(
        lobby,
        code
    );
}


// ==================================================
// READY
// ==================================================

function readyChange(
    socket,
    data
) {

    const code =
        socket.lobbyCode;

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "ready_change_failed",
            "NOT_IN_LOBBY"
        );

        return;
    }

    const player =
        findPlayerBySocket(
            lobby,
            socket
        );

    if (!player) {

        sendError(
            socket,
            "ready_change_failed",
            "PLAYER_NOT_FOUND"
        );

        return;
    }

    if (
        player.role !==
        "PLAYER"
    ) {

        sendError(
            socket,
            "ready_change_failed",
            "SPECTATOR_CANNOT_READY"
        );

        return;
    }

    if (
        player.playing
    ) {

        sendError(
            socket,
            "ready_change_failed",
            "PLAYER_ALREADY_PLAYING"
        );

        return;
    }

    player.ready =
        Boolean(
            data.ready
        );

    broadcastLobby(
        lobby,
        code
    );
}


// ==================================================
// KICK
// ==================================================

function kickPlayer(
    socket,
    data
) {

    const code =
        socket.lobbyCode;

    const lobby =
        lobbies.get(code);

    if (!lobby) {

        sendError(
            socket,
            "kick_failed",
            "NOT_IN_LOBBY"
        );

        return;
    }

    if (
        lobby.host !== socket
    ) {

        sendError(
            socket,
            "kick_failed",
            "NOT_HOST"
        );

        return;
    }

    const targetPlayer =
        findPlayer(
            lobby,
            data.player_name
        );

    if (!targetPlayer) {

        sendError(
            socket,
            "kick_failed",
            "PLAYER_NOT_FOUND"
        );

        return;
    }

    if (
        targetPlayer.socket ===
        lobby.host
    ) {

        sendError(
            socket,
            "kick_failed",
            "CANNOT_KICK_HOST"
        );

        return;
    }

    const targetSocket =
        targetPlayer.socket;

    removePlayerFromLobby(
        lobby,
        targetPlayer
    );

    sendToSocket(
        targetSocket,
        {
            type:
                "kicked_from_lobby",

            reason:
                "KICKED_BY_HOST"
        }
    );

    resetSocket(
        targetSocket
    );

    sendToSocket(
        socket,
        {
            type:
                "kick_success",

            player_name:
                targetPlayer.name
        }
    );

    if (
        lobby.players.length >
        0
    ) {

        broadcastLobby(
            lobby,
            code
        );

    } else {

        lobbies.delete(
            code
        );
    }
}


// ==================================================
// CONNECTION
// ==================================================

wss.on(
    "connection",
    socket => {

        console.log(
            "PLAYER CONNECTED"
        );

        socket.lobbyCode =
            null;

        socket.playerName =
            "";

        socket.playerId =
            null;

        socket.role =
            "PLAYER";

        socket.isHost =
            false;


        // ==================================================
        // MESSAGE
        // ==================================================

        socket.on(
            "message",
            message => {

                try {

                    const data =
                        JSON.parse(
                            message
                        );

                    if (
                        !data ||
                        !data.type
                    ) {
                        return;
                    }


                    // ==================================================
                    // CREATE
                    // ==================================================

                    if (
                        data.type ===
                        "create_lobby"
                    ) {

                        if (
                            socket.lobbyCode
                        ) {

                            sendError(
                                socket,
                                "error",
                                "ALREADY_IN_LOBBY"
                            );

                            return;
                        }

                        const playerName =
                            String(
                                data.player_name ||
                                "Player"
                            ).trim();

                        createLobby(
                            socket,
                            playerName
                        );

                        return;
                    }


                    // ==================================================
                    // JOIN
                    // ==================================================

                    if (
                        data.type ===
                        "join_lobby"
                    ) {

                        if (
                            socket.lobbyCode
                        ) {

                            sendError(
                                socket,
                                "join_failed",
                                "ALREADY_IN_LOBBY"
                            );

                            return;
                        }

                        const code =
                            String(
                                data.lobby_code ||
                                ""
                            )
                            .trim()
                            .toUpperCase();

                        const playerName =
                            String(
                                data.player_name ||
                                "Player"
                            ).trim();

                        joinLobby(
                            socket,
                            code,
                            playerName
                        );

                        return;
                    }


                    // ==================================================
                    // RECONNECT
                    // ==================================================

                    if (
                        data.type ===
                        "reconnect_lobby"
                    ) {

                        const code =
                            String(
                                data.lobby_code ||
                                ""
                            )
                            .trim()
                            .toUpperCase();

                        const playerId =
                            String(
                                data.player_id ||
                                ""
                            ).trim();

                        const playerName =
                            String(
                                data.player_name ||
                                ""
                            ).trim();

                        if (
                            code === "" ||
                            playerId === "" ||
                            playerName === ""
                        ) {

                            sendError(
                                socket,
                                "reconnect_failed",
                                "MISSING_RECONNECT_DATA"
                            );

                            return;
                        }

                        reconnectLobby(
                            socket,
                            code,
                            playerId,
                            playerName
                        );

                        return;
                    }


                    // ==================================================
                    // CHANGE ROLE
                    // ==================================================

                    if (
                        data.type ===
                        "change_role"
                    ) {

                        changeRole(
                            socket,
                            data
                        );

                        return;
                    }


                    // ==================================================
                    // START GAME
                    // ==================================================

                    if (
                        data.type ===
                        "start_game"
                    ) {

                        startGame(
                            socket
                        );

                        return;
                    }


                    // ==================================================
                    // GAME STATUS
                    // ==================================================

                    if (
                        data.type ===
                        "game_status"
                    ) {

                        gameStatus(
                            socket,
                            data
                        );

                        return;
                    }


                    // ==================================================
                    // READY
                    // ==================================================

                    if (
                        data.type ===
                        "ready_change"
                    ) {

                        readyChange(
                            socket,
                            data
                        );

                        return;
                    }


                    // ==================================================
                    // KICK
                    // ==================================================

                    if (
                        data.type ===
                        "kick_player"
                    ) {

                        kickPlayer(
                            socket,
                            data
                        );

                        return;
                    }


                    // ==================================================
                    // UNKNOWN
                    // ==================================================

                    console.log(
                        "UNKNOWN MESSAGE TYPE:",
                        data.type
                    );

                } catch (error) {

                    console.log(
                        "INVALID MESSAGE:",
                        error
                    );
                }
            }
        );


        // ==================================================
        // DISCONNECT
        // ==================================================

        socket.on(
            "close",
            () => {

                console.log(
                    "PLAYER DISCONNECTED:",
                    socket.playerName
                );

                const code =
                    socket.lobbyCode;

                if (!code) {
                    return;
                }

                const lobby =
                    lobbies.get(code);

                if (!lobby) {
                    return;
                }

                const player =
                    findPlayerBySocket(
                        lobby,
                        socket
                    );

                if (!player) {
                    return;
                }


                // ==================================================
                // QUAN TRỌNG:
                // KHÔNG XÓA PLAYER NGAY
                // ==================================================

                player.socket =
                    null;

                // Nếu là host
                if (
                    lobby.host ===
                    socket
                ) {

                    lobby.host =
                        null;

                    player.is_host =
                        false;

                    // Tạm thời giữ lobby.
                    // Chỉ chuyển host khi hết grace
                    // hoặc khi người khác reconnect.
                }


                // Giữ player trong lobby
                schedulePlayerRemoval(
                    lobby,
                    player
                );


                // ==================================================
                // NẾU HOST MẤT KẾT NỐI
                // ==================================================

                if (
                    player.is_host ===
                    false &&
                    lobby.host ===
                    null
                ) {

                    const newHost =
                        lobby.players.find(
                            p =>
                                p.player_id !==
                                player.player_id &&
                                p.role ===
                                "PLAYER" &&
                                p.socket &&
                                p.socket.readyState ===
                                WebSocket.OPEN
                        );

                    if (newHost) {

                        setHost(
                            lobby,
                            newHost
                        );

                        broadcastLobby(
                            lobby,
                            code
                        );

                        console.log(
                            "HOST DISCONNECTED.",
                            "NEW HOST:",
                            newHost.name,
                            "| LOBBY:",
                            code
                        );
                    }

                } else {

                    broadcastLobby(
                        lobby,
                        code
                    );
                }

                console.log(
                    "PLAYER KEPT FOR RECONNECT:",
                    player.name,
                    "| LOBBY:",
                    code
                );
            }
        );
    }
);


// ==================================================
// SERVER
// ==================================================

console.log(
    "Lobby server running on port",
    port
);
