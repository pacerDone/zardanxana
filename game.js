class NumberGuessingGame {
    constructor() {
        this.playerId = null;
        this.playerName = null;
        this.personalNumbers = [];
        this.currentPlayer = null;
        this.currentPlayerName = null;
        this.players = [];
        this.setupWebSocket();
        this.setupEventListeners();
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onclose = () => {
            alert('Connection lost. Please refresh the page.');
        };

        this.ws.onopen = () => {
            // Show name dialog when connection is established
            document.getElementById('name-dialog').classList.add('active');
            document.querySelector('.game-container').classList.remove('active');
        };
    }

    setupEventListeners() {
        const submitButton = document.getElementById('submit-guess');
        const guessInput = document.getElementById('guess-input');
        const joinButton = document.getElementById('join-game');
        const nameInput = document.getElementById('name-input');
        const endGameButton = document.getElementById('end-game');

        submitButton.addEventListener('click', () => this.handleGuess());
        guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleGuess();
            }
        });

        endGameButton.addEventListener('click', () => this.handleEndGame());

        joinButton.addEventListener('click', () => this.handleJoin());
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleJoin();
            }
        });
    }

    handleJoin() {
        const nameInput = document.getElementById('name-input');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('Please enter a name');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'join',
            name: name
        }));

        // Hide name dialog and show game
        document.getElementById('name-dialog').classList.remove('active');
        document.querySelector('.game-container').classList.add('active');
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'init':
                this.playerId = data.playerId;
                this.playerName = data.playerName;
                this.personalNumbers = data.personalNumbers;
                this.currentPlayer = data.currentPlayer;
                this.currentPlayerName = data.currentPlayerName;
                this.players = data.players;
                this.updateGameState();
                this.updatePersonalNumbers();
                break;

            case 'gameEnded':
                this.currentPlayer = data.currentPlayer;
                this.currentPlayerName = data.currentPlayerName;
                this.players = data.players;
                this.updateGameState();
                this.updateFeedback(data.message, true);
                this.updateFeedback(data.message, false);
                this.showAllPlayersNumbers(data.allPlayersNumbers);
                document.getElementById('guess-input').value = '';
                break;

            case 'gameState':
                this.currentPlayer = data.currentPlayer;
                this.currentPlayerName = data.currentPlayerName;
                this.players = data.players;
                this.updateGameState();
                if (data.message) {
                    this.updateFeedback(data.message, true);
                    this.updateFeedback(data.message, false);
                }
                break;

            case 'error':
                alert(data.message);
                break;

            case 'playerLeft':
                this.currentPlayer = data.currentPlayer;
                this.currentPlayerName = data.currentPlayerName;
                const message = `${data.playerName} has left the game`;
                this.updateFeedback(message + (this.players.length <= 1 ? ". Waiting for more players..." : ""), true);
                this.updateFeedback(message + (this.players.length <= 1 ? ". Waiting for more players..." : ""), false);
                this.updateGameState();
                break;

            case 'feedback':
                this.currentPlayer = data.currentPlayer;
                this.currentPlayerName = data.currentPlayerName;
                this.updateGameState();
                this.updateFeedback(data.message, true);
                this.updateFeedback(data.message, false);
                break;
        }
    }

    handleGuess() {
        if (this.currentPlayer !== this.playerId) {
            alert("It's not your turn!");
            return;
        }

        const guessInput = document.getElementById('guess-input');
        const guess = parseInt(guessInput.value);

        if (isNaN(guess) || guess < 1 || guess > 100) {
            this.updateFeedback('Please enter a valid number between 1 and 100', true);
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'guess',
            guess: guess
        }));

        guessInput.value = '';
    }

    updateGameState() {
        const playerView = document.getElementById('player-view');
        const spectatorView = document.getElementById('spectator-view');
        const currentPlayerSpan = document.getElementById('current-player');

        if (this.players.length <= 1) {
            // If there's only one player or no players
            playerView.classList.remove('active');
            spectatorView.classList.add('active');
            currentPlayerSpan.textContent = "Waiting for more players";
            return;
        }

        if (this.currentPlayer === this.playerId) {
            playerView.classList.add('active');
            spectatorView.classList.remove('active');
        } else {
            playerView.classList.remove('active');
            spectatorView.classList.add('active');
            currentPlayerSpan.textContent = this.currentPlayerName || 'Unknown';
        }
    }

    updateFeedback(message, isPlayer) {
        const feedbackElement = document.getElementById(isPlayer ? 'player-feedback' : 'spectator-feedback');
        feedbackElement.textContent = message;
    }

    updatePersonalNumbers() {
        const views = ['player-view', 'spectator-view'];
        views.forEach(viewId => {
            const numbersContainer = document.querySelector(`#${viewId} .numbers-container`);
            const numberSpans = numbersContainer.querySelectorAll('.number');
            
            this.personalNumbers.forEach((num, index) => {
                if (numberSpans[index]) {
                    numberSpans[index].textContent = num;
                }
            });
        });
    }

    handleEndGame() {
        if (this.currentPlayer !== this.playerId) {
            alert("It's not your turn!");
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'endGame'
        }));
    }

    showAllPlayersNumbers(allPlayersNumbers) {
        const views = ['player-view', 'spectator-view'];
        views.forEach(viewId => {
            const view = document.getElementById(viewId);
            const existingGameOver = view.querySelector('.game-over-numbers');
            if (existingGameOver) {
                existingGameOver.remove();
            }

            const gameOverDiv = document.createElement('div');
            gameOverDiv.className = 'game-over-numbers';
            gameOverDiv.innerHTML = '<h3>All Players\' Numbers:</h3>';

            allPlayersNumbers.forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'player-numbers';
                playerDiv.innerHTML = `
                    <strong>${player.name}'s numbers:</strong>
                    <div class="numbers-container">
                        ${player.numbers.map(num => `<span class="number">${num}</span>`).join('')}
                    </div>
                `;
                gameOverDiv.appendChild(playerDiv);
            });

            view.appendChild(gameOverDiv);
        });
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new NumberGuessingGame();
}); 