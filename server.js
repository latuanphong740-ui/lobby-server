const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();


// ==================================================
// CONSTANTS
// ==================================================

const MAX_PLAYERS = 4;


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

function findPlayerBySocket(lobby, socket) {

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
//
// Spectator KHÔNG được tính vào 4 slot.
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

function setHost(lobby, newHost) {

    if (!lobby || !newHost) {
        return;
    }

    lobby.host = newHost.socket;

    for (const player of lobby.players) {

        if (player.socket === newHost.socket) {

            player.is_host = true;
            player.role = "PLAYER";

            player.socket.isHost = true;
            player.socket.role = "PLAYER";

        } else {

            player.is_host = false;

            player.socket.isHost = false;

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
                    player.is_host

            };

        }
    );
}


// ==================================================
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(lobby, code) {

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
// REMOVE PLAYER FROM LOBBY
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


                    if (!data || !data.type) {

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

                        // ------------------------------
                        // KHÔNG CHO 1 SOCKET TẠO NHIỀU LOBBY
                        // ------------------------------

                        if (socket.lobbyCode) {

                            sendError(
                                socket,
                                "error",
                                "ALREADY_IN_LOBBY"
                            );

                            return;
                        }


                        const code =
                            generateCode();


                        const playerName =
                            String(
                                data.player_name ||
                                "Player"
                            ).trim();


                        const hostPlayer = {

                            socket:
                                socket,

                            name:
                                playerName,

                            role:
                                "PLAYER",

                            is_host:
                                true

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
                                    true

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

                        // ------------------------------
                        // KHÔNG CHO JOIN NẾU ĐÃ Ở LOBBY
                        // ------------------------------

                        if (socket.lobbyCode) {

                            sendError(
                                socket,
                                "join_failed",
                                "ALREADY_IN_LOBBY"
                            );

                            return;
                        }


                        const code =
                            String(
                                data.lobby_code || ""
                            )
                            .trim()
                            .toUpperCase();


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


                        // ------------------------------
                        // CHỈ CHECK 4 PLAYER
                        //
                        // SPECTATOR KHÔNG CHIẾM SLOT
                        // ------------------------------

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


                        const playerName =
                            String(
                                data.player_name ||
                                "Player"
                            ).trim();


                        // ------------------------------
                        // KHÔNG CHO TRÙNG TÊN
                        // ------------------------------

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


                        const newPlayer = {

                            socket:
                                socket,

                            name:
                                playerName,

                            role:
                                "PLAYER",

                            is_host:
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


                        // ------------------------------
                        // JOIN SUCCESS
                        // ------------------------------

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


                        // ------------------------------
                        // BÁO PLAYER JOINED
                        // ------------------------------

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
                                            false

                                    })
                                );

                            }

                        }


                        // ------------------------------
                        // ĐỒNG BỘ
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );

                        return;
                    }


                    // ==================================================
                    // CHANGE ROLE
                    //
                    // HOST:
                    //   đổi role người khác
                    //
                    // PLAYER:
                    //   tự đổi
                    //
                    // SPECTATOR:
                    //   tự đổi
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
                                data.player_name;


                            const targetPlayer =
                                findPlayer(
                                    lobby,
                                    targetName
                                );


                            if (!targetPlayer) {

                                sendError(
                                    socket,
                                    "role_change_failed",
                                    "PLAYER_NOT_FOUND"
                                );

                                return;
                            }


                            // ------------------------------
                            // HOST KHÔNG THỂ THÀNH SPECTATOR
                            // ------------------------------

                            if (
                                targetPlayer.socket ===
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


                            // ------------------------------
                            // ĐỔI SANG PLAYER
                            // ------------------------------

                            if (
                                newRole ===
                                "PLAYER"
                            ) {

                                // Đã là PLAYER rồi
                                if (
                                    targetPlayer.role ===
                                    "PLAYER"
                                ) {

                                    broadcastLobby(
                                        lobby,
                                        code
                                    );

                                    return;
                                }


                                // Spectator -> Player
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


                            targetPlayer.role =
                                newRole;

                            targetPlayer.socket.role =
                                newRole;


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
                        // PLAYER / SPECTATOR TỰ ĐỔI ROLE
                        // ==================================================

                        const targetName =
                            data.player_name;


                        // ------------------------------
                        // CHỈ ĐƯỢC ĐỔI CHÍNH MÌNH
                        // ------------------------------

                        if (
                            targetName !==
                            requestingPlayer.name
                        ) {

                            sendError(
                                socket,
                                "role_change_failed",
                                "ONLY_CHANGE_SELF"
                            );

                            console.log(
                                "CHANGE ROLE DENIED:",
                                requestingPlayer.name,
                                "TRY:",
                                targetName
                            );

                            return;
                        }


                        // ------------------------------
                        // KHÔNG CHO HOST THÀNH SPECTATOR
                        // ------------------------------

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


                        // ------------------------------
                        // SPECTATOR -> PLAYER
                        //
                        // KIỂM TRA CÒN SLOT
                        // ------------------------------

                        if (
                            newRole ===
                            "PLAYER"
                        ) {

                            if (
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

                        }


                        // ------------------------------
                        // ĐỔI ROLE
                        // ------------------------------

                        requestingPlayer.role =
                            newRole;

                        socket.role =
                            newRole;


                        console.log(
                            "SELF ROLE CHANGE:",
                            requestingPlayer.name,
                            "->",
                            newRole
                        );


                        // ------------------------------
                        // ĐỒNG BỘ
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );

                        return;
                    }


                    // ==================================================
                    // KICK PLAYER / SPECTATOR
                    //
                    // CHỈ HOST
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


                        // ------------------------------
                        // KIỂM TRA HOST
                        // ------------------------------

                        if (
                            lobby.host !==
                            socket
                        ) {

                            sendError(
                                socket,
                                "kick_failed",
                                "NOT_HOST"
                            );

                            console.log(
                                "KICK DENIED:",
                                socket.playerName
                            );

                            return;
                        }


                        const targetName =
                            data.player_name;


                        const targetPlayer =
                            findPlayer(
                                lobby,
                                targetName
                            );


                        if (!targetPlayer) {

                            sendError(
                                socket,
                                "kick_failed",
                                "PLAYER_NOT_FOUND"
                            );

                            return;
                        }


                        const targetSocket =
                            targetPlayer.socket;


                        // ------------------------------
                        // KHÔNG KICK HOST
                        // ------------------------------

                        if (
                            targetSocket ===
                            lobby.host
                        ) {

                            sendError(
                                socket,
                                "kick_failed",
                                "CANNOT_KICK_HOST"
                            );

                            return;
                        }


                        console.log(
                            "=================================="
                        );

                        console.log(
                            "KICK REQUEST:",
                            socket.playerName,
                            "->",
                            targetPlayer.name
                        );


                        // ------------------------------
                        // XÓA KHỎI LOBBY
                        // ------------------------------

                        removePlayerFromLobby(
                            lobby,
                            targetSocket
                        );


                        // ------------------------------
                        // BÁO NGƯỜI BỊ KICK
                        // ------------------------------

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


                        // ------------------------------
                        // RESET SOCKET
                        // ------------------------------

                        resetSocket(
                            targetSocket
                        );


                        // ------------------------------
                        // BÁO HOST
                        // ------------------------------

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


                        // ------------------------------
                        // UPDATE
                        // ------------------------------

                        if (
                            lobby.players.length > 0
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


                // --------------------------------------------------
                // SOCKET KHÔNG CÒN TRONG LOBBY
                // --------------------------------------------------

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


                // ==================================================
                // TÌM PLAYER
                // ==================================================

                const playerIndex =
                    lobby.players.findIndex(
                        (player) =>
                            player.socket ===
                            socket
                    );


                if (
                    playerIndex ===
                    -1
                ) {

                    console.log(
                        "SOCKET KHONG CON TRONG DANH SACH LOBBY"
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


                    // ------------------------------
                    // XÓA HOST
                    // ------------------------------

                    removePlayerFromLobby(
                        lobby,
                        socket
                    );


                    resetSocket(
                        socket
                    );


                    // ==================================================
                    // CÒN NGƯỜI
                    // ==================================================

                    if (
                        lobby.players.length >
                        0
                    ) {

                        // ------------------------------
                        // ƯU TIÊN PLAYER LÀM HOST
                        // ------------------------------

                        let newHost =
                            lobby.players.find(
                                (player) =>
                                    player.role ===
                                    "PLAYER"
                            );


                        // ------------------------------
                        // NẾU KHÔNG CÒN PLAYER
                        // THÌ LẤY SPECTATOR ĐẦU TIÊN
                        // ------------------------------

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


                    // ==================================================
                    // KHÔNG CÒN AI
                    // ==================================================

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


                // ------------------------------
                // LOBBY CÒN NGƯỜI
                // ------------------------------

                if (
                    lobby.players.length >
                    0
                ) {

                    broadcastLobby(
                        lobby,
                        code
                    );

                }


                // ------------------------------
                // LOBBY TRỐNG
                // ------------------------------

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


console.log(
    "Lobby server running on port",
    port
);
