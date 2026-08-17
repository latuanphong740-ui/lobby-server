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
// SET HOST
// ==================================================

function setHost(lobby, newHost) {

    if (!newHost) {
        return;
    }

    lobby.host =
        newHost.socket;

    for (const player of lobby.players) {

        const isHost =
            player.socket ===
            newHost.socket;

        player.is_host =
            isHost;

        player.socket.isHost =
            isHost;

        // Host luôn phải là PLAYER
        if (isHost) {

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
// BROADCAST LOBBY
// ==================================================

function broadcastLobby(lobby, code) {

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
// CONNECTION
// ==================================================

wss.on(
    "connection",
    (socket) => {

        console.log(
            "PLAYER CONNECTED"
        );


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


                        lobbies.set(
                            code,
                            {

                                host:
                                    socket,

                                players:
                                    [
                                        hostPlayer
                                    ]

                            }
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
                            "LOBBY CREATED:",
                            code
                        );

                        console.log(
                            "HOST:",
                            playerName
                        );
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


                        // ------------------------------
                        // LOBBY KHÔNG TỒN TẠI
                        // ------------------------------

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
                        // GỬI DANH SÁCH CHO PLAYER
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


                        console.log(
                            "PLAYER JOINED:",
                            code
                        );

                        console.log(
                            "PLAYER NAME:",
                            playerName
                        );


                        // ------------------------------
                        // ĐỒNG BỘ LOBBY
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );
                    }


                    // ==================================================
                    // CHANGE ROLE
                    //
                    // HOST:
                    // Có thể đổi role cho người khác.
                    //
                    // PLAYER / SPECTATOR:
                    // Có thể tự đổi role của chính mình.
                    //
                    // HOST không thể thành SPECTATOR.
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


                        // ------------------------------
                        // KHÔNG CÓ LOBBY
                        // ------------------------------

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


                        // ------------------------------
                        // KIỂM TRA ROLE
                        // ------------------------------

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


                        // ------------------------------
                        // TÌM NGƯỜI GỬI REQUEST
                        // ------------------------------

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
                        // TRƯỜNG HỢP 1:
                        // HOST ĐỔI ROLE CHO NGƯỜI KHÁC
                        // ==================================================

                        if (
                            socket ===
                            lobby.host
                        ) {

                            const targetName =
                                data.player_name;


                            const targetPlayer =
                                lobby.players.find(
                                    (player) =>
                                        player.name ===
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

                                console.log(
                                    "HOST CANNOT BECOME SPECTATOR"
                                );

                                socket.send(
                                    JSON.stringify({

                                        type:
                                            "role_change_failed",

                                        reason:
                                            "HOST_CANNOT_BE_SPECTATOR"

                                    })
                                );

                                return;
                            }


                            // ------------------------------
                            // ĐỔI ROLE
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
                        // TRƯỜNG HỢP 2:
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
                                "TRY TO CHANGE:",
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
                            "PLAYER SELF ROLE CHANGE:",
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


                        // ------------------------------
                        // KHÔNG CÓ LOBBY
                        // ------------------------------

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
                        // CHỈ HOST
                        // ------------------------------

                        if (
                            lobby.host !==
                            socket
                        ) {

                            console.log(
                                "KICK DENIED:",
                                socket.playerName,
                                "IS NOT CURRENT HOST"
                            );

                            console.log(
                                "CURRENT HOST:",
                                lobby.host
                                    ? lobby.host.playerName
                                    : "NONE"
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
                            lobby.players.find(
                                (player) =>
                                    player.name ===
                                    targetName
                            );


                        // ------------------------------
                        // KHÔNG TÌM THẤY
                        // ------------------------------

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
                        // KHÔNG CHO KICK HOST
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
                            "KICK REQUEST:",
                            socket.playerName,
                            "->",
                            targetPlayer.name
                        );


                        // ------------------------------
                        // XÓA PLAYER
                        // ------------------------------

                        lobby.players =
                            lobby.players.filter(
                                (player) =>
                                    player.socket !==
                                    targetSocket
                            );


                        // ------------------------------
                        // XÓA THÔNG TIN LOBBY
                        // ------------------------------

                        targetSocket.lobbyCode =
                            null;

                        targetSocket.isHost =
                            false;

                        targetSocket.role =
                            "PLAYER";


                        // ------------------------------
                        // BÁO PLAYER BỊ KICK
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
                        // UPDATE LOBBY
                        // ------------------------------

                        broadcastLobby(
                            lobby,
                            code
                        );


                        console.log(
                            "PLAYER KICKED:",
                            targetPlayer.name
                        );
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
                    "PLAYER DISCONNECTED:",
                    socket.playerName
                );


                const code =
                    socket.lobbyCode;


                if (!code) {
                    return;
                }


                const lobby =
                    lobbies.get(
                        code
                    );


                if (!lobby) {
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
                        "CURRENT HOST LEFT:",
                        socket.playerName
                    );


                    // ------------------------------
                    // XÓA HOST CŨ
                    // ------------------------------

                    lobby.players =
                        lobby.players.filter(
                            (player) =>
                                player.socket !==
                                socket
                        );


                    socket.lobbyCode =
                        null;

                    socket.isHost =
                        false;


                    // ------------------------------
                    // CÒN NGƯỜI
                    // ------------------------------

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


                        broadcastLobby(
                            lobby,
                            code
                        );
                    }


                    // ------------------------------
                    // KHÔNG CÒN AI
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


                    return;
                }


                // ==================================================
                // PLAYER / SPECTATOR DISCONNECT
                // ==================================================

                lobby.players =
                    lobby.players.filter(
                        (player) =>
                            player.socket !==
                            socket
                    );


                socket.lobbyCode =
                    null;

                socket.isHost =
                    false;


                broadcastLobby(
                    lobby,
                    code
                );
            }
        );
    }
);


console.log(
    "Lobby server running on port",
    port
);
