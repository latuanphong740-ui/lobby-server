const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();


// ==================================================
// CONSTANTS
// ==================================================

const MAX_PLAYERS = 4;
const MAX_NAME_LENGTH = 20;


// ==================================================
// GENERATE LOBBY CODE
// ==================================================

function generateCode() {

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code;

    do {

        code = "";

        for (let i = 0; i < 6; i++) {

            code += chars[
                Math.floor(
                    Math.random() * chars.length
                )
            ];

        }

    } while (lobbies.has(code));

    return code;
}


// ==================================================
// CLEAN PLAYER NAME
// ==================================================

function cleanPlayerName(name) {

    let result = String(
        name || ""
    ).trim();

    if (result.length === 0) {

        result = "Player";

    }

    if (result.length > MAX_NAME_LENGTH) {

        result =
            result.substring(
                0,
                MAX_NAME_LENGTH
            );

    }

    return result;
}


// ==================================================
// FIND PLAYER
// ==================================================

function findPlayer(lobby, name) {

    if (!lobby) {

        return null;

    }

    return lobby.players.find(
        (player) =>
            player.name === name
    );
}


// ==================================================
// FIND PLAYER BY SOCKET
// ==================================================

function findPlayerBySocket(
    lobby,
    socket
) {

    if (!lobby) {

        return null;

    }

    return lobby.players.find(
        (player) =>
            player.socket === socket
    );
}


// ==================================================
// COUNT REAL PLAYERS
// ==================================================

function countPlayers(lobby) {

    if (!lobby) {

        return 0;

    }

    return lobby.players.filter(
        (player) =>
            player.role === "PLAYER"
    ).length;
}


// ==================================================
// COUNT SPECTATORS
// ==================================================

function countSpectators(lobby) {

    if (!lobby) {

        return 0;

    }

    return lobby.players.filter(
        (player) =>
            player.role === "SPECTATOR"
    ).length;
}


// ==================================================
// SET HOST
// ==================================================

function setHost(
    lobby,
    newHost
) {

    if (
        !lobby ||
        !newHost
    ) {

        return;

    }


    lobby.host =
        newHost.socket;


    for (
        const player
        of lobby.players
    ) {

        const isNewHost =
            player.socket ===
            newHost.socket;


        player.is_host =
            isNewHost;


        player.socket.isHost =
            isNewHost;


        if (isNewHost) {

            // HOST luôn phải là PLAYER
            player.role =
                "PLAYER";

            player.socket.role =
                "PLAYER";

        }

    }


    console.log(
        "HOST UPDATED:",
        newHost.name
    );
}


// ==================================================
// MAKE PLAYER DATA
// ==================================================

function getPlayersList(lobby) {

    if (!lobby) {

        return [];

    }


    return lobby.players.map(
        (player) => {

            return {

                name:
                    player.name,

                role:
                    player.role,

                is_host:
                    player.is_host,

                ready:
                    player.ready

            };

        }
    );
}


// ==================================================
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(
    lobby,
    code
) {

    if (!lobby) {

        return;

    }


    const playersList =
        getPlayersList(lobby);


    const message =
        JSON.stringify({

            type:
                "lobby_update",

            lobby_code:
                code,

            players:
                playersList

        });


    for (
        const player
        of lobby.players
    ) {

        if (
            player.socket.readyState ===
            WebSocket.OPEN
        ) {

            player.socket.send(
                message
            );

        }

    }


    console.log(
        "LOBBY BROADCAST:",
        code,
        "| PLAYERS:",
        countPlayers(lobby),
        "| SPECTATORS:",
        countSpectators(lobby)
    );
}


// ==================================================
// REMOVE PLAYER
// ==================================================

function removePlayerFromLobby(
    lobby,
    socket
) {

    if (!lobby) {

        return;

    }


    lobby.players =
        lobby.players.filter(
            (player) =>
                player.socket !== socket
        );
}


// ==================================================
// RESET SOCKET
// ==================================================

function resetSocket(socket) {

    socket.lobbyCode = null;
    socket.playerName = "";
    socket.role = "PLAYER";
    socket.isHost = false;
}


// ==================================================
// SEND ERROR
// ==================================================

function sendError(
    socket,
    type,
    reason
) {

    if (
        socket.readyState !==
        WebSocket.OPEN
    ) {

        return;

    }


    socket.send(
        JSON.stringify({

            type:
                type,

            reason:
                reason

        })
    );
}


// ==================================================
// CONNECTION
// ==================================================

wss.on(
    "connection",
    (socket) => {

        console.log(
            "PLAYER CONNECTED"
        );


        // --------------------------------------------------
        // SOCKET DATA
        // --------------------------------------------------

        socket.lobbyCode = null;
        socket.playerName = "";
        socket.role = "PLAYER";
        socket.isHost = false;


        // ==================================================
        // MESSAGE
        // ==================================================

        socket.on(
            "message",
            (message) => {

                try {

                    const data =
                        JSON.parse(
                            message
                        );


                    if (
                        !data ||
                        typeof data !==
                        "object" ||
                        !data.type
                    ) {

                        console.log(
                            "INVALID MESSAGE DATA"
                        );

                        return;

                    }


                    // ==================================================
                    // CREATE LOBBY
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
                            cleanPlayerName(
                                data.player_name
                            );


                        const code =
                            generateCode();


                        const hostPlayer = {

                            socket:
                                socket,

                            name:
                                playerName,

                            role:
                                "PLAYER",

                            is_host:
                                true,

                            ready:
                                false

                        };


                        const lobby = {

                            host:
                                socket,

                            players:
                                [
                                    hostPlayer
                                ]

                        };


                        lobbies.set(
                            code,
                            lobby
                        );


                        socket.lobbyCode =
                            code;

                        socket.playerName =
                            playerName;

                        socket.role =
                            "PLAYER";

                        socket.isHost =
                            true;


                        socket.send(
                            JSON.stringify({

                                type:
                                    "lobby_created",

                                lobby_code:
                                    code,

                                player_name:
                                    playerName,

                                role:
                                    "PLAYER",

                                is_host:
                                    true,

                                ready:
                                    false

                            })
                        );


                        console.log(
                            "=================================="
                        );

                        console.log(
                            "LOBBY CREATED:",
                            code
                        );

                        console.log(
                            "HOST:",
                            playerName
                        );

                        console.log(
                            "PLAYERS:",
                            countPlayers(lobby)
                        );

                        console.log(
                            "SPECTATORS:",
                            countSpectators(lobby)
                        );

                        console.log(
                            "=================================="
                        );

                        return;
                    }


                    // ==================================================
                    // JOIN LOBBY
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


                        // --------------------------------------------------
                        // CHECK CODE FORMAT
                        // --------------------------------------------------

                        if (
                            !/^[A-Z0-9]{6}$/.test(
                                code
                            )
                        ) {

                            sendError(
                                socket,
                                "join_failed",
                                "INVALID_CODE"
                            );

                            return;

                        }


                        const lobby =
                            lobbies.get(
                                code
                            );


                        if (!lobby) {

                            sendError(
                                socket,
                                "join_failed",
                                "INVALID_CODE"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // PLAYER NAME
                        // --------------------------------------------------

                        const playerName =
                            cleanPlayerName(
                                data.player_name
                            );


                        // --------------------------------------------------
                        // KHÔNG TRÙNG TÊN
                        // --------------------------------------------------

                        if (
                            findPlayer(
                                lobby,
                                playerName
                            )
                        ) {

                            sendError(
                                socket,
                                "join_failed",
                                "NAME_ALREADY_IN_LOBBY"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // KIỂM TRA PLAYER SLOT
                        // --------------------------------------------------

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


                        // --------------------------------------------------
                        // TẠO PLAYER
                        // --------------------------------------------------

                        const newPlayer = {

                            socket:
                                socket,

                            name:
                                playerName,

                            role:
                                "PLAYER",

                            is_host:
                                false,

                            ready:
                                false

                        };


                        lobby.players.push(
                            newPlayer
                        );


                        socket.lobbyCode =
                            code;

                        socket.playerName =
                            playerName;

                        socket.role =
                            "PLAYER";

                        socket.isHost =
                            false;


                        console.log(
                            "PLAYER JOINED:",
                            playerName,
                            "| LOBBY:",
                            code
                        );


                        // --------------------------------------------------
                        // JOIN SUCCESS
                        // --------------------------------------------------

                        socket.send(
                            JSON.stringify({

                                type:
                                    "join_success",

                                lobby_code:
                                    code,

                                players:
                                    getPlayersList(
                                        lobby
                                    )

                            })
                        );


                        // --------------------------------------------------
                        // PLAYER JOINED
                        // --------------------------------------------------

                        for (
                            const player
                            of lobby.players
                        ) {

                            if (
                                player.socket !==
                                socket &&
                                player.socket.readyState ===
                                WebSocket.OPEN
                            ) {

                                player.socket.send(
                                    JSON.stringify({

                                        type:
                                            "player_joined",

                                        lobby_code:
                                            code,

                                        player_name:
                                            playerName,

                                        role:
                                            "PLAYER",

                                        is_host:
                                            false,

                                        ready:
                                            false

                                    })
                                );

                            }

                        }


                        // --------------------------------------------------
                        // BROADCAST
                        // --------------------------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );

                        return;
                    }


                    // ==================================================
                    // READY CHANGE
                    // ==================================================

                    if (
                        data.type ===
                        "ready_change"
                    ) {

                        const code =
                            socket.lobbyCode;


                        const lobby =
                            lobbies.get(
                                code
                            );


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


                        // --------------------------------------------------
                        // SPECTATOR KHÔNG READY
                        // --------------------------------------------------

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


                        // --------------------------------------------------
                        // LẤY TRẠNG THÁI READY
                        // --------------------------------------------------

                        const newReady =
                            data.ready === true;


                        player.ready =
                            newReady;


                        console.log(
                            "READY CHANGE:",
                            player.name,
                            "->",
                            newReady
                        );


                        // --------------------------------------------------
                        // BROADCAST
                        // --------------------------------------------------

                        broadcastLobby(
                            lobby,
                            code
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

                        const code =
                            socket.lobbyCode;


                        const lobby =
                            lobbies.get(
                                code
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


                        if (
                            !requestingPlayer
                        ) {

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
                            newRole !==
                                "PLAYER" &&
                            newRole !==
                                "SPECTATOR"
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
                            socket ===
                            lobby.host
                        ) {

                            const targetName =
                                String(
                                    data.player_name ||
                                    ""
                                );


                            const targetPlayer =
                                findPlayer(
                                    lobby,
                                    targetName
                                );


                            if (
                                !targetPlayer
                            ) {

                                sendError(
                                    socket,
                                    "role_change_failed",
                                    "PLAYER_NOT_FOUND"
                                );

                                return;

                            }


                            // HOST KHÔNG ĐƯỢC ĐỔI CHÍNH MÌNH
                            if (
                                targetPlayer.socket ===
                                socket
                            ) {

                                sendError(
                                    socket,
                                    "role_change_failed",
                                    "HOST_CANNOT_CHANGE_SELF"
                                );

                                return;

                            }


                            // --------------------------------------------------
                            // SPECTATOR -> PLAYER
                            // --------------------------------------------------

                            if (
                                newRole ===
                                "PLAYER"
                            ) {

                                if (
                                    targetPlayer.role ===
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

                            }


                            targetPlayer.role =
                                newRole;


                            targetPlayer.socket.role =
                                newRole;


                            // Nếu thành spectator thì READY phải tắt
                            if (
                                newRole ===
                                "SPECTATOR"
                            ) {

                                targetPlayer.ready =
                                    false;

                            }


                            console.log(
                                "HOST DOI ROLE:",
                                targetPlayer.name,
                                "->",
                                newRole
                            );


                            broadcastLobby(
                                lobby,
                                code
                            );

                            return;
                        }


                        // ==================================================
                        // PLAYER / SPECTATOR TỰ ĐỔI
                        // ==================================================

                        const targetName =
                            String(
                                data.player_name ||
                                ""
                            );


                        if (
                            targetName !==
                            requestingPlayer.name
                        ) {

                            sendError(
                                socket,
                                "role_change_failed",
                                "ONLY_CHANGE_SELF"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // HOST KHÔNG THỂ THÀNH SPECTATOR
                        // --------------------------------------------------

                        if (
                            socket ===
                            lobby.host &&
                            newRole ===
                            "SPECTATOR"
                        ) {

                            sendError(
                                socket,
                                "role_change_failed",
                                "HOST_CANNOT_BE_SPECTATOR"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // SPECTATOR -> PLAYER
                        // --------------------------------------------------

                        if (
                            newRole ===
                            "PLAYER" &&
                            requestingPlayer.role ===
                            "SPECTATOR"
                        ) {

                            if (
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

                        }


                        requestingPlayer.role =
                            newRole;


                        socket.role =
                            newRole;


                        // Spectator không được giữ READY
                        if (
                            newRole ===
                            "SPECTATOR"
                        ) {

                            requestingPlayer.ready =
                                false;

                        }


                        console.log(
                            "SELF ROLE CHANGE:",
                            requestingPlayer.name,
                            "->",
                            newRole
                        );


                        broadcastLobby(
                            lobby,
                            code
                        );

                        return;
                    }


                    // ==================================================
                    // KICK PLAYER
                    // ==================================================

                    if (
                        data.type ===
                        "kick_player"
                    ) {

                        const code =
                            socket.lobbyCode;


                        const lobby =
                            lobbies.get(
                                code
                            );


                        if (!lobby) {

                            sendError(
                                socket,
                                "kick_failed",
                                "NOT_IN_LOBBY"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // CHỈ HOST
                        // --------------------------------------------------

                        if (
                            lobby.host !==
                            socket
                        ) {

                            sendError(
                                socket,
                                "kick_failed",
                                "NOT_HOST"
                            );

                            return;

                        }


                        const targetName =
                            String(
                                data.player_name ||
                                ""
                            );


                        const targetPlayer =
                            findPlayer(
                                lobby,
                                targetName
                            );


                        if (
                            !targetPlayer
                        ) {

                            sendError(
                                socket,
                                "kick_failed",
                                "PLAYER_NOT_FOUND"
                            );

                            return;

                        }


                        // --------------------------------------------------
                        // KHÔNG KICK HOST
                        // --------------------------------------------------

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


                        console.log(
                            "=================================="
                        );

                        console.log(
                            "KICK REQUEST:",
                            socket.playerName,
                            "->",
                            targetPlayer.name
                        );


                        // --------------------------------------------------
                        // BÁO BỊ KICK TRƯỚC
                        // --------------------------------------------------

                        if (
                            targetSocket.readyState ===
                            WebSocket.OPEN
                        ) {

                            targetSocket.send(
                                JSON.stringify({

                                    type:
                                        "kicked_from_lobby",

                                    reason:
                                        "KICKED_BY_HOST"

                                })
                            );

                        }


                        // --------------------------------------------------
                        // XÓA KHỎI LOBBY
                        // --------------------------------------------------

                        removePlayerFromLobby(
                            lobby,
                            targetSocket
                        );


                        resetSocket(
                            targetSocket
                        );


                        // --------------------------------------------------
                        // BÁO HOST
                        // --------------------------------------------------

                        if (
                            socket.readyState ===
                            WebSocket.OPEN
                        ) {

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "kick_success",

                                    player_name:
                                        targetPlayer.name

                                })
                            );

                        }


                        // --------------------------------------------------
                        // UPDATE
                        // --------------------------------------------------

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


                        console.log(
                            "PLAYER KICKED:",
                            targetPlayer.name
                        );

                        console.log(
                            "=================================="
                        );

                        return;
                    }


                    // ==================================================
                    // UNKNOWN MESSAGE
                    // ==================================================

                    console.log(
                        "UNKNOWN MESSAGE TYPE:",
                        data.type
                    );

                }

                catch (error) {

                    console.log(
                        "=================================="
                    );

                    console.log(
                        "INVALID MESSAGE"
                    );

                    console.log(
                        error
                    );

                    console.log(
                        "=================================="
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
                    "=================================="
                );

                console.log(
                    "PLAYER DISCONNECTED:",
                    socket.playerName
                );


                const code =
                    socket.lobbyCode;


                if (!code) {

                    console.log(
                        "SOCKET KHONG CON TRONG LOBBY"
                    );

                    console.log(
                        "=================================="
                    );

                    return;

                }


                const lobby =
                    lobbies.get(
                        code
                    );


                if (!lobby) {

                    console.log(
                        "LOBBY KHONG TON TAI"
                    );

                    console.log(
                        "=================================="
                    );

                    return;

                }


                const player =
                    findPlayerBySocket(
                        lobby,
                        socket
                    );


                if (!player) {

                    console.log(
                        "PLAYER KHONG CON TRONG LOBBY"
                    );

                    console.log(
                        "=================================="
                    );

                    return;

                }


                // ==================================================
                // HOST DISCONNECT
                // ==================================================

                if (
                    lobby.host ===
                    socket
                ) {

                    console.log(
                        "HOST DANG ROI LOBBY:",
                        socket.playerName
                    );


                    removePlayerFromLobby(
                        lobby,
                        socket
                    );


                    resetSocket(
                        socket
                    );


                    // --------------------------------------------------
                    // CÒN NGƯỜI
                    // --------------------------------------------------

                    if (
                        lobby.players.length >
                        0
                    ) {

                        // Ưu tiên PLAYER
                        let newHost =
                            lobby.players.find(
                                (p) =>
                                    p.role ===
                                    "PLAYER"
                            );


                        // Nếu chỉ còn spectator
                        // lấy spectator đầu tiên
                        if (!newHost) {

                            newHost =
                                lobby.players[0];

                        }


                        setHost(
                            lobby,
                            newHost
                        );


                        console.log(
                            "NEW HOST:",
                            newHost.name
                        );


                        broadcastLobby(
                            lobby,
                            code
                        );

                    }

                    else {

                        lobbies.delete(
                            code
                        );

                        console.log(
                            "LOBBY DELETED:",
                            code
                        );

                    }


                    console.log(
                        "=================================="
                    );

                    return;

                }


                // ==================================================
                // PLAYER / SPECTATOR DISCONNECT
                // ==================================================

                console.log(
                    "PLAYER/SPECTATOR ROI LOBBY:",
                    socket.playerName
                );


                removePlayerFromLobby(
                    lobby,
                    socket
                );


                resetSocket(
                    socket
                );


                if (
                    lobby.players.length >
                    0
                ) {

                    broadcastLobby(
                        lobby,
                        code
                    );

                }

                else {

                    lobbies.delete(
                        code
                    );

                    console.log(
                        "LOBBY DELETED:",
                        code
                    );

                }


                console.log(
                    "=================================="
                );

            }
        );

    }
);


// ==================================================
// SERVER START
// ==================================================

console.log(
    "Lobby server running on port",
    port
);
