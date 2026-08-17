const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

const lobbies = new Map();


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
// SET HOST
// ==================================================

function setHost(lobby, newHost) {

    if (!lobby || !newHost) {
        return;
    }

    lobby.host =
        newHost.socket;

    for (const player of lobby.players) {

        if (
            player.socket ===
            newHost.socket
        ) {

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
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(lobby, code) {

    if (!lobby) {
        return;
    }

    const playersList =
        lobby.players.map(
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


                    // ==================================================
                    // CREATE LOBBY
                    // ==================================================

                    if (
                        data.type ===
                        "create_lobby"
                    ) {

                        const code =
                            generateCode();

                        const playerName =
                            data.player_name ||
                            "Player";


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

                        const code =
                            data.lobby_code
                                ?.toUpperCase();


                        const lobby =
                            lobbies.get(
                                code
                            );


                        if (!lobby) {

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "join_failed",

                                    reason:
                                        "INVALID_CODE"

                                })
                            );

                            return;
                        }


                        // ------------------------------
                        // LOBBY FULL
                        // ------------------------------

                        if (
                            lobby.players.length >=
                            4
                        ) {

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "join_failed",

                                    reason:
                                        "LOBBY_FULL"

                                })
                            );

                            return;
                        }


                        const playerName =
                            data.player_name ||
                            "Player";


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
                        // GỬI JOIN SUCCESS
                        // ------------------------------

                        const playersList =
                            lobby.players.map(
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


                        socket.send(
                            JSON.stringify({

                                type:
                                    "join_success",

                                lobby_code:
                                    code,

                                players:
                                    playersList

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
                    //   Có thể đổi role người khác
                    //
                    // PLAYER:
                    //   Có thể tự đổi role
                    //
                    // SPECTATOR:
                    //   Có thể tự đổi role
                    //
                    // HOST không thể thành SPECTATOR
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

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "role_change_failed",

                                    reason:
                                        "NOT_IN_LOBBY"

                                })
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

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "role_change_failed",

                                    reason:
                                        "INVALID_ROLE"

                                })
                            );

                            return;
                        }


                        const requestingPlayer =
                            lobby.players.find(
                                (player) =>
                                    player.socket ===
                                    socket
                            );


                        if (!requestingPlayer) {

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "role_change_failed",

                                    reason:
                                        "PLAYER_NOT_FOUND"

                                })
                            );

                            return;
                        }


                        // ==================================================
                        // HOST ĐỔI ROLE CHO NGƯỜI KHÁC
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

                                socket.send(
                                    JSON.stringify({

                                        type:
                                            "role_change_failed",

                                        reason:
                                            "PLAYER_NOT_FOUND"

                                    })
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

                                socket.send(
                                    JSON.stringify({

                                        type:
                                            "role_change_failed",

                                        reason:
                                            "HOST_CANNOT_BE_SPECTATOR"

                                    })
                                );

                                console.log(
                                    "HOST CANNOT BECOME SPECTATOR"
                                );

                                return;
                            }


                            // ------------------------------
                            // ĐỔI ROLE PLAYER KHÁC
                            // ------------------------------

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

                            console.log(
                                "CHANGE ROLE DENIED:",
                                requestingPlayer.name,
                                "TRY:",
                                targetName
                            );


                            socket.send(
                                JSON.stringify({

                                    type:
                                        "role_change_failed",

                                    reason:
                                        "ONLY_CHANGE_SELF"

                                })
                            );

                            return;
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
                        // ĐỒNG BỘ TOÀN BỘ LOBBY
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );

                        return;
                    }


                    // ==================================================
                    // KICK PLAYER
                    //
                    // CHỈ HOST ĐƯỢC KICK
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

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "kick_failed",

                                    reason:
                                        "NOT_IN_LOBBY"

                                })
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

                            console.log(
                                "KICK DENIED:",
                                socket.playerName,
                                "IS NOT HOST"
                            );


                            socket.send(
                                JSON.stringify({

                                    type:
                                        "kick_failed",

                                    reason:
                                        "NOT_HOST"

                                })
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

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "kick_failed",

                                    reason:
                                        "PLAYER_NOT_FOUND"

                                })
                            );

                            return;
                        }


                        const targetSocket =
                            targetPlayer.socket;


                        // ------------------------------
                        // KHÔNG KICK CHÍNH HOST
                        // ------------------------------

                        if (
                            targetSocket ===
                            lobby.host
                        ) {

                            socket.send(
                                JSON.stringify({

                                    type:
                                        "kick_failed",

                                    reason:
                                        "CANNOT_KICK_HOST"

                                })
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
                        // XÓA TARGET KHỎI LOBBY
                        // ------------------------------

                        removePlayerFromLobby(
                            lobby,
                            targetSocket
                        );


                        // ------------------------------
                        // XÓA THÔNG TIN SOCKET
                        // ------------------------------

                        targetSocket.lobbyCode =
                            null;

                        targetSocket.playerName =
                            "";

                        targetSocket.role =
                            "PLAYER";

                        targetSocket.isHost =
                            false;


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

                        broadcastLobby(
                            lobby,
                            code
                        );


                        console.log(
                            "PLAYER KICKED:",
                            targetPlayer.name
                        );

                        console.log(
                            "=================================="
                        );

                        return;
                    }

                }

                catch (error) {

                    console.log(
                        "INVALID MESSAGE"
                    );

                    console.log(
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
                    "=================================="
                );

                console.log(
                    "PLAYER DISCONNECTED:",
                    socket.playerName
                );


                const code =
                    socket.lobbyCode;


                // --------------------------------------------------
                // SOCKET ĐÃ BỊ KICK / KHÔNG CÒN TRONG LOBBY
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
                // KIỂM TRA SOCKET CÓ THỰC SỰ CÒN TRONG LOBBY KHÔNG
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
                    // XÓA HOST CŨ
                    // ------------------------------

                    removePlayerFromLobby(
                        lobby,
                        socket
                    );


                    socket.lobbyCode =
                        null;

                    socket.playerName =
                        "";

                    socket.role =
                        "PLAYER";

                    socket.isHost =
                        false;


                    // ==================================================
                    // CÒN NGƯỜI -> CHỌN HOST MỚI
                    // ==================================================

                    if (
                        lobby.players.length >
                        0
                    ) {

                        const newHost =
                            lobby.players[0];


                        setHost(
                            lobby,
                            newHost
                        );


                        console.log(
                            "NEW HOST:",
                            newHost.name
                        );


                        // ------------------------------
                        // ĐỒNG BỘ TOÀN BỘ
                        // ------------------------------

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


                socket.lobbyCode =
                    null;

                socket.playerName =
                    "";

                socket.role =
                    "PLAYER";

                socket.isHost =
                    false;


                // ------------------------------
                // NẾU LOBBY CÒN NGƯỜI
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
                // NẾU LOBBY TRỐNG
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
