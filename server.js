const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('./'));

// Game state
let gameState = {
    players: new Map(),
    targetNumber: Math.floor(Math.random() * 100) + 1000,
    currentPlayerIndex: 0,
    playerOrder: []
};

function resetGameState() {
    gameState.targetNumber = Math.floor(Math.random() * 100) + 1000;
    gameState.currentPlayerIndex = 0;
}

function getRandomPersonalNumbers(count = 5) {
    const numbers = [];
    for (let i = 0; i < count; i++) {
        numbers.push((Math.floor(Math.random() * 6000) + 1)%6 + 1);
    }
    return numbers;
}

wss.on('connection', (ws) => {
    // Wait for player to send their name before adding them to the game
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'join') {
            // Assign player ID, name, and personal numbers
            const playerId = `player${gameState.players.size + 1}`;
            const playerName = data.name.trim() || `Player ${gameState.players.size + 1}`;
            const personalNumbers = getRandomPersonalNumbers();
            gameState.players.set(ws, { id: playerId, name: playerName, personalNumbers });
            gameState.playerOrder.push(ws);

            // Send initial game state with personal numbers
            ws.send(JSON.stringify({
                type: 'init',
                playerId: playerId,
                playerName: playerName,
                personalNumbers: personalNumbers,
                currentPlayer: gameState.players.get(gameState.playerOrder[gameState.currentPlayerIndex]).id,
                currentPlayerName: gameState.players.get(gameState.playerOrder[gameState.currentPlayerIndex]).name,
                players: Array.from(gameState.players.values()).map(p => ({ id: p.id, name: p.name }))
            }));

            // Broadcast updated player list (without personal numbers)
            broadcastGameState();
            return;
        }
        
        if (data.type === 'endGame') {
            const currentPlayerWs = gameState.playerOrder[gameState.currentPlayerIndex];
            
            if (ws !== currentPlayerWs) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Not your turn!'
                }));
                return;
            }

            const currentPlayer = gameState.players.get(ws);
            const allPlayersNumbers = Array.from(gameState.players.entries()).map(([playerWs, player]) => ({
                id: player.id,
                name: player.name,
                numbers: player.personalNumbers
            }));

            const feedback = {
                type: 'gameEnded',
                message: `${currentPlayer.name} ended the game. The target number was ${gameState.targetNumber}`,
                allPlayersNumbers: allPlayersNumbers
            };

            // Reset game state
            gameState.targetNumber = Math.floor(Math.random() * 100) + 1000;
            gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;

            // Broadcast the result to all players
            broadcastGameState(feedback);
            return;
        }
        
        if (data.type === 'guess') {
            const currentPlayerWs = gameState.playerOrder[gameState.currentPlayerIndex];
            
            if (ws !== currentPlayerWs) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Not your turn!'
                }));
                return;
            }

            const guess = parseInt(data.guess);
            const filanQeder = guess/10;
            const filanZer = guess%4;
            let feedback;
            const currentPlayer = gameState.players.get(ws);
            
            if (guess === gameState.targetNumber) {
                feedback = {
                    type: 'gameOver',
                    winner: currentPlayer.name,
                    message: `${currentPlayer.name} won! The number was ${gameState.targetNumber}`
                };
                // Reset game
                gameState.targetNumber = Math.floor(Math.random() * 100) + 1000;
                // Move to next player for new game
                gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
            } else {
                const direction = guess > gameState.targetNumber ? 'down' : 'up';
                // Move to next player before creating feedback
                gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
                const nextPlayer = gameState.players.get(gameState.playerOrder[gameState.currentPlayerIndex]);
                
                feedback = {
                    type: 'feedback',
                    message: `${currentPlayer.name}'s deyir ki, elinde "${filanQeder}" dene "${filanZer}" var`,
                    filanQeder: filanQeder,
                    filanZer: filanZer,
                    direction: direction,
                    currentPlayer: nextPlayer.id,
                    currentPlayerName: nextPlayer.name
                };
            }
            // Broadcast the result to all players
            broadcastGameState(feedback);
        }
    });

    ws.on('close', () => {
        const player = gameState.players.get(ws);
        const leavingPlayerIndex = gameState.playerOrder.indexOf(ws);
        
        // If the leaving player was before the current player, adjust the current index
        if (leavingPlayerIndex < gameState.currentPlayerIndex) {
            gameState.currentPlayerIndex--;
        }
        
        // Remove the player
        gameState.players.delete(ws);
        gameState.playerOrder = gameState.playerOrder.filter(p => p !== ws);
        
        if (gameState.playerOrder.length === 0) {
            // Reset the game if no players are left
            resetGameState();
        } else if (gameState.currentPlayerIndex >= gameState.playerOrder.length) {
            // Only wrap around if we're at the end of the list
            gameState.currentPlayerIndex = 0;
        }

        if (player) {
            broadcastGameState({
                type: 'playerLeft',
                playerId: player.id,
                playerName: player.name,
                currentPlayer: gameState.playerOrder.length > 0 ? 
                    gameState.players.get(gameState.playerOrder[gameState.currentPlayerIndex]).id : null,
                currentPlayerName: gameState.playerOrder.length > 0 ? 
                    gameState.players.get(gameState.playerOrder[gameState.currentPlayerIndex]).name : null
            });
        }
    });
});

function broadcastGameState(additionalData = null) {
    const currentPlayerWs = gameState.playerOrder[gameState.currentPlayerIndex];
    const baseMessage = {
        type: 'gameState',
        currentPlayer: currentPlayerWs ? gameState.players.get(currentPlayerWs).id : null,
        currentPlayerName: currentPlayerWs ? gameState.players.get(currentPlayerWs).name : null,
        players: Array.from(gameState.players.values()).map(p => ({ id: p.id, name: p.name }))
    };

    const message = additionalData ? { ...baseMessage, ...additionalData } : baseMessage;

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 
