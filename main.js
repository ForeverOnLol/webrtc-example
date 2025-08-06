// Состояние приложения
const state = {
    socket: null,
    peerConnection: null,
    dataChannel: null,
    currentRoom: null,
    isInitiator: false,
    isChannelReady: false
};

// Элементы DOM
const elements = {
    messages: document.getElementById("messages"),
    messageInput: document.getElementById("messageInput"),
    startCall: document.getElementById("joinRoom"),
    endCall: document.getElementById("leaveRoom"),
    sendMessage: document.getElementById("sendMessage"),
    status: document.getElementById("status")
};

// Инициализация Socket.io
function initSocket() {
    state.socket = io('http://localhost:5000');

    state.socket.on('connect', () => {
        updateStatus("Connected to signaling server");
    });

    state.socket.on('disconnect', () => {
        updateStatus("Disconnected from signaling server");
    });

    state.socket.on('ready', () => {
        updateStatus("Starting WebRTC connection...");
        state.isInitiator = true;
        createPeerConnection();
    });

    state.socket.on('offer', async (data) => {
        if (!state.peerConnection) {
            createPeerConnection();
        }
        try {
            await state.peerConnection.setRemoteDescription(data.sdp);
            const answer = await state.peerConnection.createAnswer();
            await state.peerConnection.setLocalDescription(answer);
            state.socket.emit('answer', {
                room: state.currentRoom,
                sdp: state.peerConnection.localDescription
            });
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    });

    state.socket.on('answer', async (data) => {
        try {
            await state.peerConnection.setRemoteDescription(data.sdp);
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    });

    state.socket.on('ice-candidate', async (data) => {
        try {
            if (data.candidate) {
                await state.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    });

    state.socket.on('user-left', () => {
        updateStatus("Other user disconnected");
        closeConnection();
    });
}

// Создание RTCPeerConnection
function createPeerConnection() {
    try {
        // Конфигурация без внешних ICE-серверов (только локальные кандидаты)
        const config = { iceServers: [] };

        state.peerConnection = new RTCPeerConnection(config);

        // Обработка ICE кандидатов
        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                state.socket.emit('ice-candidate', {
                    room: state.currentRoom,
                    candidate: event.candidate
                });
            }
        };

        // Создание канала данных (только для инициатора)
        if (state.isInitiator) {
            state.dataChannel = state.peerConnection.createDataChannel("chat");
            setupDataChannel(state.dataChannel);
        }

        // Обработка входящего канала данных
        state.peerConnection.ondatachannel = (event) => {
            state.dataChannel = event.channel;
            setupDataChannel(state.dataChannel);
        };

        // Отслеживание состояния соединения
        state.peerConnection.onconnectionstatechange = () => {
            updateStatus(`Connection state: ${state.peerConnection.connectionState}`);
            if (state.peerConnection.connectionState === 'connected') {
                state.isChannelReady = true;
            }
        };

        // Если мы инициатор, создаем offer
        if (state.isInitiator) {
            createOffer();
        }

    } catch (error) {
        console.error("Error creating peer connection:", error);
        updateStatus(`Error: ${error.message}`);
    }
}

// Создание offer
async function createOffer() {
    try {
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        state.socket.emit('offer', {
            room: state.currentRoom,
            sdp: offer
        });
    } catch (error) {
        console.error("Error creating offer:", error);
    }
}

// Настройка DataChannel
function setupDataChannel(channel) {
    channel.onopen = () => {
        state.isChannelReady = true;
        updateStatus("Ready to chat!");
        elements.messageInput.disabled = false;
        elements.sendMessage.disabled = false;
        elements.messageInput.focus();
    };

    channel.onclose = () => {
        state.isChannelReady = false;
        updateStatus("Connection closed");
        disableChatInput();
    };

    channel.onmessage = (event) => {
        addMessage(`Remote: ${event.data}`);
    };

    channel.onerror = (error) => {
        console.error("Data channel error:", error);
    };
}

// Отправка сообщения
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message) return;

    if (state.isChannelReady && state.dataChannel) {
        try {
            state.dataChannel.send(message);
            addMessage(`You: ${message}`);
            elements.messageInput.value = "";
        } catch (error) {
            console.error("Error sending message:", error);
        }
    } else {
        updateStatus("Channel not ready!");
    }
}

// Закрытие соединения
function closeConnection() {
    if (state.dataChannel) {
        state.dataChannel.close();
        state.dataChannel = null;
    }

    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }

    state.isChannelReady = false;
    state.isInitiator = false;

    disableChatInput();
    updateStatus("Disconnected");
}

// Вспомогательные функции
function disableChatInput() {
    elements.messageInput.disabled = true;
    elements.sendMessage.disabled = true;
}

function addMessage(message) {
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    elements.messages.appendChild(messageElement);
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function updateStatus(message) {
    elements.status.textContent = message;
    console.log("Status:", message);
}

// Обработчики событий
elements.startCall.addEventListener('click', () => {
    state.currentRoom = "default-room";
    initSocket();
    state.socket.emit('join', { room: state.currentRoom });
    elements.startCall.disabled = true;
    elements.endCall.disabled = false;
});

elements.endCall.addEventListener('click', () => {
    closeConnection();
    if (state.socket) {
        state.socket.emit('leave', { room: state.currentRoom });
    }
    elements.startCall.disabled = false;
    elements.endCall.disabled = true;
});

elements.sendMessage.addEventListener('click', sendMessage);

elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Инициализация UI
disableChatInput();
elements.endCall.disabled = true;
updateStatus("Click 'Start Connection' to begin");