(function init() {
    const P1 = 'X';
    const P2 = 'O';
    let player;
    let game;

    const socket = io.connect('http://localhost:3000');

    class Player {
        constructor(name, type) {
            this.name = name;
            this.type = type;
            this.currentTurn = true;
            this.playsArr = 0;
        }

        static get wins() {
            return [7, 56, 448, 73, 146, 292, 273, 84];
        }

        // Set the bit of the move played by the player
        // squareValue - Bitmask used to set the recently played move.
        updatePlaysArr(squareValue) {
            this.playsArr += squareValue;
        }

        getPlaysArr() {
            return this.playsArr;
        }

        // Set the currentTurn for player to turn and update UI each turn
        setCurrentTurn(turn) {
            this.currentTurn = turn;
            const message = turn ? "It's your turn" : "Waiting for the second user";
            $('#turn').text(message);
        }

        getPlayerName() {
            return this.name;
        }

        getPlayerType() {
            return this.type;
        }

        getCurrentTurn() {
            return this.currentTurn;
        }
    }

    // roomId : ID of the room in which the game is running on the server.
    class Game {
        constructor(roomId) {
            this.roomId = roomId;
            this.board = [];
            this.moves = 0;
        }

        // Create the Game board by attaching event listeners to the buttons.
        createGameBoard() {
                function squareClickHandler() {
                    const row = parseInt(this.id.split('_')[1][0], 10);
                    const col = parseInt(this.id.split('_')[1][1], 10);
                    if (!player.getCurrentTurn() || !game) {
                        $('#alert').text('Its not your turn!');
                        return;
                    }

                    if ($(this).prop('disabled')) {
                        $('#alert').text('This square has already been played on!');
                        return;
                    }

                    // Update board after your turn.
                    game.playTurn(this);
                    game.updateBoard(player.getPlayerType(), row, col, this.id);

                    player.setCurrentTurn(false);
                    player.updatePlaysArr(1 << ((row * 3) + col));

                    $('#alert').text('');

                    game.checkWinner();
                }

                for (let i = 0; i < 3; i++) {
                    this.board.push(['', '', '']);
                    for (let j = 0; j < 3; j++) {
                        $(`#button_${i}${j}`).on('click', squareClickHandler);
                    }
                }
            }
            // Remove the menu from DOM, display the gameboard and greet the player.
        displayBoard(message) {
            $('.menu').css('display', 'none');
            $('.gameBoard').css('display', 'block');
            $('#userHello').html(message);
            this.createGameBoard();
        }

        updateBoard(type, row, col, square) {
            $(`#${square}`).text(type).prop('disabled', true);
            this.board[row][col] = type;
            this.moves++;
        }

        getRoomId() {
            return this.roomId;
        }

        // Send an update to the opponent to update their UI's square
        playTurn(square) {
            const clickedsquare = $(square).attr('id');

            // Emit an event to update other player that you've played your turn.
            socket.emit('playTurn', {
                square: clickedsquare,
                room: this.getRoomId(),
            });
        }

        checkWinner() {
            const currentPlayerPositions = player.getPlaysArr();
            var winner = false;
            Player.wins.forEach((winningPosition) => {
                if ((winningPosition & currentPlayerPositions) === winningPosition) {
                    game.announceWinner();
                    winner = true;
                }
            });

            const tieMessage = 'Tie';
            if (this.checkTie() && !winner) {
                socket.emit('gameEnded', {
                    room: this.getRoomId(),
                    message: tieMessage,
                });
                alert(tieMessage);
                location.reload();
            }
        }

        checkTie() {
            return this.moves >= 9;
        }

        // Announce the winner if the current client has won. 
        // Broadcast this on the room to let the opponent know.
        announceWinner() {
            const message = `Game over ! ${player.getPlayerName()} wins!`;
            socket.emit('gameEnded', {
                room: this.getRoomId(),
                message,
            });
            alert(message);
            location.reload();
        }

        // End the game if the other player won.
        endGame(message) {
            alert(message);
            location.reload();
        }
    }

    // Create a new game. Emit newGame event.
    $('#new').on('click', () => {
        const name = $('#nameNew').val();
        if (!name) {
            alert('Please enter your name.');
            return;
        }
        socket.emit('createGame', { name });
        player = new Player(name, P1);
    });

    // Join an existing game on the entered roomId. Emit the joinGame event.
    $('#join').on('click', () => {
        const name = $('#nameJoin').val();
        const roomID = $('#room').val();
        if (!name || !roomID) {
            alert('Please enter your name and game ID.');
            return;
        }
        socket.emit('joinGame', { name, room: roomID });
        player = new Player(name, P2);
    });

    // New Game created by current client. Update the UI and create new Game var.
    socket.on('newGame', (data) => {
        const message =
            `Hello, ${data.name}. Please ask your friend to enter Game ID: 
      ${data.room}. Waiting for player 2...`;

        // Create game for player 1
        game = new Game(data.room);
        game.displayBoard(message);
    });

    /**
     * If player creates the game, he'll be P1(X) and has the first turn.
     * This event is received when opponent connects to the room.
     */
    socket.on('player1', (data) => {
        const message = `Hello, ${player.getPlayerName()}`;
        $('#userHello').html(message);
        player.setCurrentTurn(true);
    });

    /**
     * Joined the game, so player is P2(O). 
     * This event is received when P2 successfully joins the game room. 
     */
    socket.on('player2', (data) => {
        const message = `Hello, ${data.name}`;

        // Create game for player 2
        game = new Game(data.room);
        game.displayBoard(message);
        player.setCurrentTurn(false);
    });

    /**
     * Opponent played his turn. Update UI.
     * Allow the current player to play now. 
     */
    socket.on('turnPlayed', (data) => {
        const row = data.square.split('_')[1][0];
        const col = data.square.split('_')[1][1];
        const opponentType = player.getPlayerType() === P1 ? P2 : P1;

        game.updateBoard(opponentType, row, col, data.square);
        player.setCurrentTurn(true);
    });

    // If the other player wins, this event is received. Notify user game has ended.
    socket.on('gameEnd', (data) => {
        game.endGame(data.message);
        socket.leave(data.room);
    });

    /**
     * End the game on any err event. 
     */
    socket.on('err', (data) => {
        game.endGame(data.message);
    });
}());