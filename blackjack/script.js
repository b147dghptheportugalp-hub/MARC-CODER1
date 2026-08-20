// =====================================
// BLACKJACK TABLE
// =====================================

let deck = [];
let dealerHand = [];
let players = [];
let balance = 1000;
let bet = 100;
let wins = 0;
let losses = 0;
let gameActive = false;
let dealerHidden = true;
let currentPlayer = null;
let turnOrder = [];
let turnIndex = 0;

const suits = [
    { symbol: "♠", color: "black" },
    { symbol: "♥", color: "red" },
    { symbol: "♦", color: "red" },
    { symbol: "♣", color: "black" }
];

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createDeck() {
    deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ rank, suit: suit.symbol, color: suit.color });
        }
    }
    shuffle();
}

function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
        const random = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[random]] = [deck[random], deck[i]];
    }
}

function cardValue(card) {
    if (card.rank === "A") return 11;
    if (["K", "Q", "J"].includes(card.rank)) return 10;
    return Number(card.rank);
}

function handValue(hand) {
    let total = 0;
    let aces = 0;

    hand.forEach(card => {
        total += cardValue(card);
        if (card.rank === "A") aces++;
    });

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function drawCard() {
    if (deck.length === 0) createDeck();
    return deck.pop();
}

function createSVGCard(card, hidden = false) {
    const div = document.createElement("div");
    div.className = "card";

    if (hidden) {
        div.classList.add("back");
        div.innerHTML = `
            <svg viewBox="0 0 120 170">
                <rect x="5" y="5" width="110" height="160" rx="15" fill="#123caa" stroke="gold" stroke-width="4"/>
                <path d="M20 40 L100 130 M100 40 L20 130" stroke="#fff" stroke-width="5"/>
            </svg>
        `;
        return div;
    }

    const color = card.color === "red" ? "#d00000" : "#000";
    div.innerHTML = `
        <svg viewBox="0 0 120 170">
            <rect x="5" y="5" width="110" height="160" rx="15" fill="white" stroke="#222" stroke-width="4"/>
            <text x="15" y="35" font-size="25" fill="${color}" font-weight="bold">${card.rank}${card.suit}</text>
            <text x="60" y="100" font-size="55" text-anchor="middle" fill="${color}">${card.suit}</text>
            <text x="105" y="150" font-size="25" text-anchor="end" fill="${color}" font-weight="bold" transform="rotate(180 105 150)">${card.rank}${card.suit}</text>
        </svg>
    `;

    return div;
}

function buildPlayers(totalSeats, humanSeats) {
    const safeTotal = clamp(totalSeats || 1, 1, 6);
    const safeHuman = clamp(humanSeats || 1, 1, safeTotal);
    const seatList = [];

    for (let i = 0; i < safeTotal; i++) {
        const isHuman = i < safeHuman;
        const name = isHuman
            ? (i === 0 ? "You" : `Player ${i + 1}`)
            : `AI ${i + 1}`;

        seatList.push({
            name,
            isHuman,
            hand: [],
            hasFinished: false,
            seatIndex: i
        });
    }

    return seatList;
}

function showMessage(text) {
    const box = document.getElementById("gameMessage");
    if (box) box.innerHTML = text;
}

function enableControls() {
    document.getElementById("hitBtn").disabled = false;
    document.getElementById("standBtn").disabled = false;
    document.getElementById("doubleBtn").disabled = false;
}

function disableControls() {
    document.getElementById("hitBtn").disabled = true;
    document.getElementById("standBtn").disabled = true;
    document.getElementById("doubleBtn").disabled = true;
}

function displayCards() {
    const dealerCards = document.getElementById("dealerCards");
    const seats = document.getElementById("seats");
    const dealerScore = document.getElementById("dealerScore");

    dealerCards.innerHTML = "";
    seats.innerHTML = "";

    if (dealerHand.length) {
        dealerHand.forEach((card, index) => {
            dealerCards.appendChild(createSVGCard(card, index === 1 && dealerHidden));
        });
    }

    if (dealerScore) {
        dealerScore.textContent = dealerHidden ? "?" : handValue(dealerHand);
    }

    seats.className = "seatGrid";

    players.forEach(player => {
        const seatCard = document.createElement("div");
        seatCard.classList.add("seatCard");
        seatCard.classList.add(player.isHuman ? "human" : "ai");

        if (currentPlayer && currentPlayer === player) {
            seatCard.classList.add("currentTurn");
        }

        if (!player.hasFinished) {
            seatCard.classList.add("active");
        }

        const status = player.isHuman
            ? (player.hasFinished ? "Finished" : "Waiting")
            : (player.hasFinished ? "Finished" : "AI turn");

        const score = handValue(player.hand);
        const cardContainer = document.createElement("div");
        cardContainer.className = "seatCards";

        if (player.hand.length) {
            player.hand.forEach(card => cardContainer.appendChild(createSVGCard(card)));
        } else {
            const empty = document.createElement("span");
            empty.className = "seatEmpty";
            empty.textContent = "Waiting for cards";
            cardContainer.appendChild(empty);
        }

        const header = document.createElement("div");
        header.innerHTML = `<h3>${player.name}</h3><span class="seatStatus">${status}</span>`;

        const scoreLine = document.createElement("div");
        scoreLine.className = "seatScore";
        scoreLine.textContent = `Score: ${score}`;

        seatCard.appendChild(header);
        seatCard.appendChild(scoreLine);
        seatCard.appendChild(cardContainer);
        seats.appendChild(seatCard);
    });
}

function startGame() {
    if (bet <= 0) {
        showMessage("Place a bet first!");
        return;
    }

    const totalSeats = Number(document.getElementById("playerCount").value) || 1;
    const humanSeats = Number(document.getElementById("humanCount").value) || 1;

    if (humanSeats > totalSeats) {
        showMessage("You cannot have more human players than seats at the table.");
        return;
    }

    players = buildPlayers(totalSeats, humanSeats);
    turnOrder = [...players];
    turnIndex = 0;
    currentPlayer = null;
    createDeck();
    dealerHand = [];
    dealerHidden = true;
    gameActive = true;

    players.forEach(player => {
        player.hand = [];
        player.hasFinished = false;
    });

    players.forEach(player => player.hand.push(drawCard()));
    dealerHand.push(drawCard());
    players.forEach(player => player.hand.push(drawCard()));
    dealerHand.push(drawCard());

    displayCards();
    startNextTurn();
}

function startNextTurn() {
    if (!gameActive) return;

    if (turnIndex >= turnOrder.length) {
        dealerTurn();
        return;
    }

    currentPlayer = turnOrder[turnIndex];
    turnIndex += 1;
    currentPlayer.hasFinished = false;

    displayCards();

    if (currentPlayer.isHuman) {
        enableControls();
        showMessage(`${currentPlayer.name}, your turn - Hit or Stand`);
        return;
    }

    disableControls();
    showMessage(`${currentPlayer.name} is thinking...`);

    setTimeout(() => {
        playAIBot(currentPlayer);
    }, 800);
}

function playAIBot(player) {
    let score = handValue(player.hand);

    while (score < 17 && !isBust(player.hand)) {
        player.hand.push(drawCard());
        score = handValue(player.hand);
        displayCards();
    }

    if (isBust(player.hand)) {
        player.hasFinished = true;
        showMessage(`${player.name} busts.`);
    } else {
        player.hasFinished = true;
        showMessage(`${player.name} stands on ${score}.`);
    }

    setTimeout(startNextTurn, 700);
}

function hit() {
    if (!gameActive || !currentPlayer || !currentPlayer.isHuman || currentPlayer.hasFinished) return;

    currentPlayer.hand.push(drawCard());
    displayCards();

    const score = handValue(currentPlayer.hand);

    if (score > 21) {
        currentPlayer.hasFinished = true;
        showMessage(`${currentPlayer.name} busts!`);
        setTimeout(startNextTurn, 700);
        return;
    }

    if (score === 21) {
        currentPlayer.hasFinished = true;
        showMessage(`${currentPlayer.name} hits 21!`);
        setTimeout(startNextTurn, 700);
        return;
    }

    showMessage(`${currentPlayer.name}: ${score}`);
}

function stand() {
    if (!gameActive || !currentPlayer || !currentPlayer.isHuman || currentPlayer.hasFinished) return;

    currentPlayer.hasFinished = true;
    showMessage(`${currentPlayer.name} stood.`);
    setTimeout(startNextTurn, 500);
}

function doubleDown() {
    if (!gameActive || !currentPlayer || !currentPlayer.isHuman || currentPlayer.hasFinished) return;

    if (balance < bet) {
        showMessage("Not enough money to double!");
        return;
    }

    balance -= bet;
    bet *= 2;
    updateStats();

    currentPlayer.hand.push(drawCard());
    displayCards();

    currentPlayer.hasFinished = true;

    if (handValue(currentPlayer.hand) > 21) {
        showMessage(`${currentPlayer.name} busts on the double down.`);
    } else {
        showMessage(`${currentPlayer.name} doubled down.`);
    }

    setTimeout(startNextTurn, 700);
}

function dealerTurn() {
    dealerHidden = false;
    displayCards();
    showMessage("Dealer's turn...");

    setTimeout(() => {
        let dealerScore = handValue(dealerHand);
        while (dealerScore < 17) {
            dealerHand.push(drawCard());
            dealerScore = handValue(dealerHand);
            displayCards();
        }
        checkWinner();
    }, 900);
}

function isBust(hand) {
    return handValue(hand) > 21;
}

function updateStats() {
    document.getElementById("balance").textContent = "$" + balance;
    document.getElementById("currentBet").textContent = "$" + bet;
    document.getElementById("wins").textContent = wins;
    document.getElementById("losses").textContent = losses;
}

function addBet(amount) {
    if (balance >= amount) {
        bet += amount;
        balance -= amount;
        updateStats();
        showMessage("Bet: $" + bet);
    } else {
        showMessage("Not enough money");
    }
}

function clearBet() {
    balance += bet;
    bet = 0;
    updateStats();
}

function getResultForPlayer(player) {
    const dealerScore = handValue(dealerHand);
    const playerScore = handValue(player.hand);
    const playerBust = isBust(player.hand);
    const dealerBust = isBust(dealerHand);

    if (playerBust) return false;
    if (dealerBust) return true;

    const playerBlackjack = player.hand.length === 2 && playerScore === 21;
    const dealerBlackjack = dealerHand.length === 2 && dealerScore === 21;

    if (playerBlackjack && !dealerBlackjack) return true;
    if (dealerBlackjack && !playerBlackjack) return false;

    if (playerScore > dealerScore) return true;
    if (playerScore < dealerScore) return false;
    return "tie";
}

function checkWinner() {
    const dealerScore = handValue(dealerHand);
    const dealerBust = isBust(dealerHand);
    const summary = [`Dealer score: ${dealerScore}`];
    let humanOutcome = null;

    players.forEach(player => {
        const outcome = getResultForPlayer(player);
        let line = `${player.name}: `;

        if (player.isHuman && humanOutcome === null) {
            humanOutcome = outcome;
        }

        if (outcome === true) {
            line += "🎉 Win";
        } else if (outcome === false) {
            line += dealerBust ? "❌ Dealer bust - you win" : "❌ Loss";
        } else {
            line += "🤝 Push";
        }

        summary.push(line);
    });

    finishRound(summary.join("<br>"), humanOutcome);
}

function finishRound(summary, humanOutcome) {
    gameActive = false;
    dealerHidden = false;
    displayCards();
    disableControls();

    if (humanOutcome === true) {
        balance += bet * 2;
        wins++;
    } else if (humanOutcome === false) {
        losses++;
    } else if (humanOutcome === "tie") {
        balance += bet;
    }

    updateStats();
    showMessage(summary);
}

function newGame() {
    dealerHand = [];
    players = [];
    gameActive = false;
    dealerHidden = true;
    currentPlayer = null;
    turnOrder = [];
    turnIndex = 0;
    displayCards();
    showMessage("Press Deal Cards to start");
}

function showPopup(title, text) {
    const overlay = document.getElementById("overlay");
    const popupTitle = document.getElementById("popupTitle");
    const popupText = document.getElementById("popupText");

    if (!overlay) return;
    popupTitle.textContent = title;
    popupText.textContent = text;
    overlay.classList.remove("hidden");
}

function closePopup() {
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.add("hidden");
}

window.onload = function () {
    updateStats();
    displayCards();

    document.getElementById("dealBtn").onclick = startGame;
    document.getElementById("hitBtn").onclick = hit;
    document.getElementById("standBtn").onclick = stand;
    document.getElementById("doubleBtn").onclick = doubleDown;
    document.getElementById("newGameBtn").onclick = newGame;
    document.getElementById("clearBet").onclick = clearBet;

    document.getElementById("continueBtn").onclick = closePopup;

    document.querySelectorAll(".betBtn").forEach(button => {
        button.onclick = function () {
            addBet(Number(this.dataset.bet));
        };
    });
};

function cardSound() {
    try {
        const audio = new AudioContext();
        const osc = audio.createOscillator();
        osc.frequency.value = 600;
        osc.connect(audio.destination);
        osc.start();
        setTimeout(() => osc.stop(), 80);
    } catch (e) {}
}
