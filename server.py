from flask import Flask, render_template, request  # Добавлен импорт request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранилище для комнат и их участников
rooms = {}


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('join')
def handle_join(data):
    room = data['room']
    if room not in rooms:
        rooms[room] = []

    if len(rooms[room]) >= 2:
        emit('error', {'message': 'Room is full'})
        return

    rooms[room].append(request.sid)
    join_room(room)
    emit('joined', {'room': room}, room=request.sid)

    if len(rooms[room]) == 2:
        emit('ready', {}, room=room)


@socketio.on('offer')
def handle_offer(data):
    room = data['room']
    emit('offer', {
        'sdp': data['sdp'],
        'sender': request.sid
    }, room=room, include_self=False)


@socketio.on('answer')
def handle_answer(data):
    room = data['room']
    emit('answer', {
        'sdp': data['sdp'],
        'sender': request.sid
    }, room=room, include_self=False)


@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    room = data['room']
    emit('ice-candidate', {
        'candidate': data['candidate'],
        'sender': request.sid
    }, room=room, include_self=False)


@socketio.on('disconnect')
def handle_disconnect():
    for room, participants in rooms.items():
        if request.sid in participants:
            participants.remove(request.sid)
            emit('user-left', {'sid': request.sid}, room=room)
            if not participants:
                del rooms[room]
            break


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)