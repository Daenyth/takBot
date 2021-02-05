const Discord = require('discord.js');
const fs = require('fs');
const lzutf8 = require('lzutf8');
const crypto = require('crypto');
const auth = require('./auth.json');
const {TPStoCanvas} = require('./TPS-Ninja/src');
const {once} = require('events');
const {compressToEncodedURIComponent} = require('lz-string');

const client = new Discord.Client();
const theme = "discord";



// Helper functions

function validPly(cmd) {
    return (cmd.match(/(\d)?([CcSs])?([a-hA-H])([1-8])(([<>+-])([1-8]+)?(\*)?)?/i)) ? true : false;
}

function getEncodedHashFromFile(msg) {
    let dirname = 'data/' + msg.channel.id;
    try {
        let files = fs.readdirSync(dirname);
        files.sort();
        let filename = files[files.length-1];
        filename = 'data/' + msg.channel.id + '/' + filename;
        return fs.readFileSync(filename, 'utf8');
    } catch (err) {
        // On error we assume that the file doesn't exist
    }
} 

function saveEncodedHashToFile(msg, encodedHash) {
    let dirname = 'data/' + msg.channel.id;
    try {
        fs.mkdirSync(dirname, {recursive:true});
    } catch (err) {
        console.log(err);
    }
    let filename = Date.now() + crypto.randomBytes(2).toString("hex");
    if (20 - filename.length > 0) {
        for (let i = 0; i < 20-filename.length; i++) {
            filename = '0' + filename;
        }
    }
    filename = 'data/' + msg.channel.id + '/' + filename + '.data';
    try {
        fs.writeFileSync(filename, encodedHash);
    } catch (err) {
        console.log(err);
    }
}

function deleteEncodedHashFile(msg) {
    let dirname = 'data/' + msg.channel.id;
    try {
        let files = fs.readdirSync(dirname);
        files.sort();
        let filename = files[files.length-1];
        filename = 'data/' + msg.channel.id + '/' + filename;
        fs.unlinkSync(filename);
    } catch (err) {
        console.log(err);
    }
}

function cleanupFiles(msg) {
    let dirname = 'data/' + msg.channel.id;
    try {
        fs.rmdirSync(dirname, {recursive:true, force:true});
    } catch (err) {
        console.log(err);
    }
}

function getDataFromEncodedHash(encodedHash) {
    let gameHash = lzutf8.decompress(decodeURI(encodedHash.replaceAll('_', '/')), {'inputEncoding': 'Base64'});
    let playersString = gameHash.split('___')[0];
    let players = playersString.split('_');
    let tps = gameHash.split('___')[1];
    let turnMarker = tps.split('__')[1];
    tps = tps.replaceAll('__', ' ').replaceAll('_', ',').replaceAll('-', '/');
    let komi = (gameHash.split('___')[2]) ? gameHash.split('___')[2] : 0;
    let gameId = (gameHash.split('___')[3]) ? gameHash.split('___')[3] : 0;
    return {
        'player1': players[0],
        'player2': players[1],
        'tps': tps,
        'turnMarker': turnMarker,
        'komi': komi,
        'gameId': gameId
    };
}

function encodeHashFromData(gameData) {
    let gameHash = gameData.player1 + '_' + gameData.player2
            + '___' + gameData.tps.replaceAll('/', '-').replaceAll(',', '_').replaceAll(' ', '__')
            + '___' + gameData.komi
            + '___' + gameData.gameId;
    return encodeURI(lzutf8.compress(gameHash, {'outputEncoding': 'Base64'})).replaceAll('/', '_');
}

function createPtnFile(gameData) {
    try {
        fs.mkdirSync('ptn', {recursive:true});
    } catch (err) {
        console.log(err);
    }

    let gameId = Date.now() + crypto.randomBytes(2).toString("hex");
    let filename = 'ptn/' + gameId + '.ptn';
    let data = '[Player1 "' + gameData.player1 + '"][Player2 "' + gameData.player2 + '"][Size "' + gameData.size + '"][Komi "' + gameData.komi + '"] ';
    try {
        fs.writeFileSync(filename, data);
    } catch (err) {
        console.log(err);
    }
    return gameId;
}

function addPlyToPtnFile(gameId, ply) {
    ply = ply.toLowerCase();
    if (ply.match(/[c][a-h][1-8]/)) {
        ply = ply.replace('c', 'C');
    } else if (ply.match(/[s][a-h][1-8]/)) {
        ply = ply.replace('s', 'S');
    }

    let filename = 'ptn/' + gameId + '.ptn';
    try {
        let data = fs.readFileSync(filename, 'utf8');
        data = data + ' ' + ply;
        fs.writeFileSync(filename, data);
    } catch (err) {
        console.log(err);
    }
}

function removeLastPlyFromPtnFile(gameId) {
    let filename = 'ptn/' + gameId + '.ptn';
    try {
        let data = fs.readFileSync(filename, 'utf8');
        data = data.substr(0, data.lastIndexOf(' '));
        fs.writeFileSync(filename, data);
    } catch (err) {
        console.log(err);
    }
}

function getPtnFromFile(gameId) {
    let filename = 'ptn/' + gameId + '.ptn';
    try {
        return fs.readFileSync(filename, 'utf8');
    } catch (err) {
        console.log(err);
    }
}

function addToHistoryFile(gameData) {
    let filename = 'results.db';
    let resultString = gameData.gameId + ', ' + gameData.player1 + ', ' + gameData.player2 + ', ' + gameData.komi + ', ' + gameData.result + '\n';
    try {
        fs.appendFileSync(filename, resultString);
    } catch (err) {
        console.log(err);
    }
}

function getHistoryFromFile() {
    let filename = 'results.db';
    try {
        return fs.readFileSync(filename, 'utf8');
    } catch (err) {
        console.log(err);
    }
}



// Getter functions for reading from Discord

async function getGameMessages(msg) {
    let messages = await msg.channel.messages.fetch();
    return messages.filter(m => m.author.id === client.user.id).filter(m => m.attachments.array().length != 0);
}

async function fetchPlayerData(gameData) {
    const result = {};
    await Promise.all([
        client.users.fetch(gameData.player1).then(
            (player1) => { result.player1 = player1.username; }
        ),
        client.users.fetch(gameData.player2).then(
            (player2) => { result.player2 = player2.username; }
        )
    ]);
    return result;
}



// Functions to send to Discord

async function sendPngToDiscord(msg, canvas, messageComment) {
    try {
        fs.mkdirSync('images', {recursive:true});
    } catch (err) {
        console.log(err);
    }
    let filename = 'images/' + msg.channel.id + '.png';
    let out = fs.createWriteStream(filename);
    let stream = canvas.pngStream();
    stream.pipe(out);
    await once(out, 'finish');
    await msg.channel.send(messageComment, {
        files: [{
            attachment: filename,
            name: filename
        }]
    });
    fs.unlink(filename, (err) => {
        if (err) console.log(err);
    });
}



// Major handler methods

function handleNew(msg, args) {
    if (msg.mentions.users.array().length != 1) {
        msg.channel.send('I didn\'t understand. See `!tak help` for example commands.');
    } else {
        let player1 = msg.mentions.users.first();
        let player2 = msg.author;
        let size = (args[1]) ? args[1] : '6';
        if (size !== '3' && size !== '4' && size !== '5' && size !== '6' && size !== '7' && size !== '8') {
            msg.channel.send('Invalid board size.');
            return;
        }
        let komi = (args[2]) ? args[2] : '0';
        let canvas;
        try {
            canvas = TPStoCanvas({
                'tps': size,
                'komi': komi,
                'player1': player1.username,
                'player2': player2.username,
                'padding': false,
                'theme': theme
            });
        } catch (error) {
            msg.channel.send('An issue occurred while generating the starting board.');
            return;
        }

        cleanupFiles(msg);

        let gameId = createPtnFile({'player1': player1.username, 'player2': player2.username, 'size': size, 'komi': komi});
        let encodedHash = encodeHashFromData({'player1': player1.id, 'player2': player2.id, 'tps': canvas.id, 'komi': komi, 'gameId': gameId});
        let messageComment = 'Type a valid move in ptn notation to play. (<https://ustak.org/portable-tak-notation/>)';
        saveEncodedHashToFile(msg, encodedHash);
        sendPngToDiscord(msg, canvas, messageComment);
    }
}

async function handleMove(msg, ply) {
    let encodedHash = getEncodedHashFromFile(msg);
    if (!encodedHash) return;

    let gameData = getDataFromEncodedHash(encodedHash);

    if (msg.author.id != gameData.player1 && msg.author.id != gameData.player2) {
        return;
    }

    if ((gameData.turnMarker == '1' && msg.author.id != gameData.player1)
            || (gameData.turnMarker == '2' && msg.author.id != gameData.player2)) {
        msg.channel.send('You are not the active player.');
        return;
    }

    let playerData = await fetchPlayerData(gameData);
    let canvas;
    try {
        canvas = TPStoCanvas({
            'tps': gameData.tps,
            'ply': ply,
            'komi': gameData.komi,
            'player1': playerData.player1,
            'player2': playerData.player2,
            'padding': false,
            'theme': theme
        });
    } catch (err) {
        if (!err.message.includes('Invalid ply')) {
            console.log(err);
        }
        msg.channel.send('Invalid move.');
        return;
    }
    if (gameData.gameId != 0) addPlyToPtnFile(gameData.gameId, ply);

    let nextPlayer = gameData.player1;
    if (gameData.turnMarker == '1') nextPlayer = gameData.player2;

    let messageComment = 'Your turn '+canvas.linenum+', <@'+nextPlayer+'>';
    if (canvas.isGameEnd) {
        messageComment = 'GG <@'+nextPlayer+'>! Game Ended ' + canvas.id;
        cleanupFiles(msg);
        if (gameData.gameId != 0) addToHistoryFile({'gameId': gameData.gameId, 'player1': playerData.player1, 'player2': playerData.player2, 'komi': gameData.komi, 'result': canvas.id});
    } else {
        encodedHash = encodeHashFromData({'player1': gameData.player1, 'player2': gameData.player2, 'tps': canvas.id, 'komi': gameData.komi, 'gameId': gameData.gameId});
        saveEncodedHashToFile(msg, encodedHash);
    }

    sendPngToDiscord(msg, canvas, messageComment);
}

async function handleUndo(msg) {
    let encodedHash = getEncodedHashFromFile(msg);
    if (!encodedHash) {
        msg.channel.send('You cannot undo a completed game.');
        return;
    }

    let gameData = getDataFromEncodedHash(encodedHash);

    if (msg.author.id != gameData.player1 && msg.author.id != gameData.player2) {
        return;
    }

    if ((gameData.turnMarker == '1' && msg.author.id != gameData.player2)
            || (gameData.turnMarker == '2' && msg.author.id != gameData.player1)) {
        msg.channel.send('You cannot undo a move that is not your own.');
        retturn;
    }

    let messages = await getGameMessages(msg);
    if (messages.array().length >= 0) {
        let message = messages.first();
        message.delete();
    }

    if (gameData.gameId != 0) removeLastPlyFromPtnFile(gameData.gameId);
    deleteEncodedHashFile(msg);
}

async function handleLink(msg, args) {
    let gameId;
    let gameData;

    if (args[1]) {
        gameId = args[1];
    } else {
        let encodedHash = getEncodedHashFromFile(msg);
        if (!encodedHash) {
            msg.channel.send('You must use the gameId to get a link for a completed game. See `!tak history` to get the gameId.');
            return;
        }

        gameData = getDataFromEncodedHash(encodedHash);
        gameId = gameData.gameId;
    }

    if (gameId != 0) {
        msg.channel.send('https://ptn.ninja/' + compressToEncodedURIComponent(getPtnFromFile(gameId)));
    } else {
        let playerData = await fetchPlayerData(gameData);
        msg.channel.send('https://ptn.ninja/'
            + compressToEncodedURIComponent('[TPS "'
                + gameData.tps + '"][Player1 "'
                + playerData.player1 + '"][Player2 "'
                + playerData.player2 + '"][Komi "'
                + gameData.komi + '"]'));
    }
}

function handleHistory(msg) {
    let historyData = getHistoryFromFile();
    msg.channel.send(historyData);
}

function handleHelp(msg) {
    msg.channel.send('Use `!tak @opponent [size] [komi]` to start a new game.\
        \nSize (optional, default 6): Valid values are 3 through 8.\
        \nKomi (optional, default 0): A flat-score bonus for the second player. Valid values are any half-integer from 0 up to the size of the board.\
        \n\nThe challenged player gets to move first.\
        \n\nThe bot tracks games through the channel id.\
        \nIf you want to run multiple games at once, please use different channels.\
        \n\nAlso, here\'s a PTN reference link: <https://ustak.org/portable-tak-notation/>\
        \n\nExample commands:\
        \n```!tak help\
        \n!tak @opponent\
        \n!tak @opponent <size>\
        \n!tak @opponent <size> <komi>\
        \n!tak undo\
        \n!tak link\
        \n!tak link <gameId>\
        \n!tak history\
        \n<while playing, any valid ply on its own line>```');
}



// Main code

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
    let message = msg.content;
    if (message.length >= 4 && message.substring(0, 4) == '!tak') {
        let args = message.substring(5).split(' ');
        let cmd = args[0];
        switch(cmd) {
            case 'help':
                handleHelp(msg);
                break;
            case 'undo':
                handleUndo(msg);
                break;
            case 'link':
                handleLink(msg, args);
                break;
            case 'history':
                handleHistory(msg);
                break;
            default:
                handleNew(msg, args);
                break;
        }
    } else {
        let args = message.split(' ');
        if (args.length != 1) return;
        if (!validPly(args[0])) return;
        handleMove(msg, args[0]);
    }
});

client.login(auth.token);
