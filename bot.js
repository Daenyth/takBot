const Discord = require('discord.js');
const fs = require('fs');
const lzutf8 = require('lzutf8');
const auth = require('./auth.json');
const theme = "discord";
const {TPStoCanvas} = require('./TPS-Ninja/src');

const client = new Discord.Client();

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
                msg.channel.send('Use `!tak @opponent (optional 5 or 6 to set size)` to start a new game.\
                    \nThe challenged player gets to move first.\
                    \n\nThe bot tracks games through the last move in the channel and can only see 50 message back.\
                    \nIf you want to run multiple games at once, please use different channels.\
                    \n\nExample commands:\
                    \n```!tak help\
                    \n!tak @opponent\
                    \n!tak @opponent <size>\
                    \n!tak undo\
                    \n<while playing, any valid ply on it\'s own line>```');
                break;
            case 'undo':
                msg.channel.messages.fetch()
                .then(messages => {
                    let myMessages = messages.filter(m => m.author.id === client.user.id).filter(m => m.attachments.array().length != 0);
                    if (myMessages.array().length == 0) {
                        msg.channel.send('You need to have a game in progress before undo will work...');
                        return;
                    }
                    
                    let message = myMessages.first();
                    let tpsHash = message.content.split('||')[1];
                    tpsHash = lzutf8.decompress(decodeURI(tpsHash.replaceAll('_', '/')), {'inputEncoding': 'Base64'});
                    let playersString = tpsHash.split('___')[0];
                    let players = playersString.split('_');
                    let tps = tpsHash.split('___')[1];
                    let turnMarker = tps.split('__')[1];
                    
                    if (msg.author.id != players[0] && msg.author.id != players[1]) {
                       return;
                    }
                    if ((turnMarker == '1' && msg.author.id != players[1])
                            || (turnMarker == '2' && msg.author.id != players[0])) {
                        msg.channel.send('You cannot undo a move that is not your own.');
                        return;
                    }
                    
                    message.delete();
                });
                break;
            default:
                if (msg.mentions.users.array().length != 1) {
                    msg.channel.send('You must mention exactly one user as your opponent.');
                } else {
                    let userId = msg.mentions.users.first().id;
                    let canvas = TPStoCanvas({tps: args[1], theme});
                    let tpsHash = userId + '_' + msg.author.id + '___' + canvas.id.replaceAll('/', '-').replaceAll(',', '_').replaceAll(' ', '__');
                    tpsHash = encodeURI(lzutf8.compress(tpsHash, {'outputEncoding': 'Base64'})).replaceAll('/', '_');
                    let filename = msg.channel.id + '.png';
                    let out = fs.createWriteStream(filename);
                    let stream = canvas.pngStream();
                    stream.pipe(out);
                    out.on('finish', () => {
                        msg.channel.send('Type a valid move in ptn notation to play. (<https://ustak.org/portable-tak-notation/>)\n||'+tpsHash+'||', {
                            files: [{
                                attachment: filename,
                                name: filename
                            }]
                        })
                        .then(() => {
                            fs.unlink(filename, (err) => {
                                if (err) console.log(error);
                            });
                        })
                        .catch(console.error);
                    });
                }
                break;
        }
    } else {
        let args = message.split(' ');
        let cmd = args[0];
        if (args.length == 1) {
            let matchData = cmd.match(
                /(\d)?([CcSs])?([a-hA-H])([1-8])(([<>+-])([1-8]+)?(\*)?)?/i
            );
            if (!matchData) {
                return;
            }

            msg.channel.messages.fetch()
            .then(messages => {
                let myMessages = messages.filter(m => m.author.id === client.user.id).filter(m => m.attachments.array().length != 0);
                if (myMessages.array().length == 0) {
                    return;
                }
                let message = myMessages.first();
                let tpsHash = message.content.split('||')[1];
                tpsHash = lzutf8.decompress(decodeURI(tpsHash.replaceAll('_', '/')), {'inputEncoding': 'Base64'});
                let playersString = tpsHash.split('___')[0];
                let players = playersString.split('_');
                let tps = tpsHash.split('___')[1];
                let turnMarker = tps.split('__')[1];
                tps = tps.replaceAll('__', ' ').replaceAll('_', ',').replaceAll('-', '/');

                if (msg.author.id != players[0] && msg.author.id != players[1]) {
                    return;
                }
                    
                if ((turnMarker == '1' && msg.author.id != players[0])
                    || (turnMarker == '2' && msg.author.id != players[1])) {
                    msg.channel.send('You are not the active player');
                    return;
                }

                let canvas;
                try {
                    canvas = TPStoCanvas({'tps': tps, 'ply': cmd, theme});
                } catch {
                    msg.channel.send('Invalid move.');
                    return;
                }

                let nextPlayer = players[0];
                if (turnMarker == '1') nextPlayer = players[1];
                tpsHash = playersString + '___' + canvas.id.replaceAll('/', '-').replaceAll(',', '_').replaceAll(' ', '__')
                tpsHash = encodeURI(lzutf8.compress(tpsHash, {'outputEncoding': 'Base64'})).replaceAll('/', '_');
                let messageBack = 'Your turn, <@'+nextPlayer+'>\n||'+tpsHash+'||';
                if (canvas.isGameEnd) {
                    messageBack = 'Game Over! ' + canvas.id;
                }
                
                let filename = msg.channel.id + '.png';
                let out = fs.createWriteStream(filename);
                let stream = canvas.pngStream();
                stream.pipe(out);
                out.on('finish', () => {
                    msg.channel.send(messageBack, {
                        files: [{
                            attachment: filename,
                            name: filename
                        }]
                    })
                    .then(() => {
                        fs.unlink(filename, (err) => {
                            if (err) console.log(error);
                        });
                    })
                    .catch(console.error);
                })
            })
            .catch(console.error);
         }
     }
});

client.login(auth.token);
