'use strict';

// Dependencies
let Dota2 = require('./modules/steam_login'),
    request = require('request'),
    Bunzip = require('seek-bzip'),
    config = require('./config'),
    fs = require('fs'),
    redis = require('./modules/redis'),
    heroes = require('./heroes.json');

const spawn = require('child_process').spawn;
const startMovieTmpl = fs.readFileSync('./templates/startmovie', 'utf-8');
const loadReplayTmpl = fs.readFileSync('./templates/loadreplay', 'utf-8');

// Variables
let matchMeta = {
    "players": [],
    "duration": '',
    "cluster": '',
    "replay_salt": ''
};

let task = {
    "heroName": "Sniper",
    "id": 2742558168,
    "recordStartTime": 111600,
    "recordDuration": 5,
    "heroIndex": "",
};

unlinkLogAndFrames();

redis.getAsync(`replay:${task.id}`)
    .then((res)=> {
        if (res) {
            matchMeta = JSON.parse(res);

            getPlayerIndex(matchMeta).then((index)=> {
                task.heroIndex = index;
                dotaAction();
            });
        } else { Dota2.on("ready", onD2Ready) }
    });

/**
 * Dota2 Client on Ready
 */
function onD2Ready() {
    getMatchDetails()
        .then((matchData)=> {
            matchMeta.players = matchData.match.players.map((player)=> {
                return {
                    "account_id": player.account_id,
                    "hero_id": player.hero_id,
                    "player_name": player.player_name,
                    "player_slot": player.player_slot
                };
            });
            matchMeta.replay_salt = matchData.match.replay_salt;
            matchMeta.cluster = matchData.match.cluster;
            matchMeta.duration = matchData.match.duration;

            return matchMeta;
        })
        .then((matchMeta)=> {
            redis.set(`replay:${task.id}`, JSON.stringify(matchMeta), (err)=> {
                if(err){ onError(err) }
            });
            return matchMeta;
        })
        .then(getPlayerIndex)
        .then((index)=> {
            task.heroIndex = index;
            return matchMeta;
        })
        .then(fetchReplay, onError)
        .then(decompressBZ2, onError)
        .then(dotaAction, onError);
}

/**
 * Fetch Match Details
 * @returns {Promise}
 */
function  getMatchDetails() {
    return new Promise((resolve)=> {
        Dota2.requestMatchDetails(task.id);
        Dota2.on("matchDetailsData", (matchId, matchData)=> {
            resolve(matchData);
        });
    });
}

/**
 * Get Player Index
 * @returns {Promise}
 */
function getPlayerIndex(meta) {
    return new Promise((resolve)=> {
        heroes.heroes.forEach((heroInfo)=> {
            if(task.heroName === heroInfo.localized_name){
                meta.players.forEach((playerInfo, index)=> {
                    if(playerInfo.hero_id === heroInfo.id){
                        resolve(index);
                    }
                });
            }
        });
    });
}

/**
 * Action with Dota 2
 */
function dotaAction() {
    // return new Promise((resolve, reject)=> {
        fs.writeFile(`${config.d2Dir}/dota/cfg/loadreplay.cfg`,
            loadReplayTmpl.replace(/<-demoFileID->/, `replays/${task.id}`),
            (err)=> {
                if(err){ onError(err) }
                const d2launch = spawn(`${config.d2Dir}/dota.sh`, ['-console -exec autoexec']);

                setTimeout(calculateStartTick, 50000);

                let terminatedFrame = `${config.d2Dir}/dota/${config.recordMovie.recordToDir}${getTerminatedFrame()}.tga`;
                console.log(`Terminate Movie Recording by Frame: ${terminatedFrame}`);
                terminateByFrame(terminatedFrame);

                d2launch.on('close', (code) => {
                    console.log(`Dota 2 Process Exited with Code: ${code}`);
                    if (code === 0 || code === 137) { console.log(`Movie Recording is Done`) }
                    //     resolve() }
                    // else{ reject() }
                });
            });
    // })
}

/**
 * Fetch Replay Data for Clip Recoding
 * @param meta (match)
 * @returns {Promise}
 */
function fetchReplay(meta) {
    return new Promise((resolve, reject)=> {
        let matchID = task.id;
        let reqStream = request
            .get(`http://replay${meta.cluster}.valve.net/570/`+
                `${matchID}_${meta.replay_salt}.dem.bz2?v=1`)
            .on('error', (err)=>{
                if(err){ reject(err) }
            })
            .on('response', (res)=> {
                if(res.statusCode != 200){ reject(`Status Code: ${res.statusCode}`) }
            })
            .pipe(fs.createWriteStream(`${config.bz2}/${matchID}.dem.bz2`));

        reqStream.on('finish', ()=>{
            console.log(`Replay #${matchID} was Downloaded`);
            resolve();
        })
    })
}

/**
 * Decompress dem.bz2 Files
 * @returns {Promise}
 */
function decompressBZ2() {
    return new Promise((resolve, reject)=> {
        let matchID = task.id;

        fs.readFile(`${config.bz2}/${matchID}.dem.bz2`, (err, compressedData)=> {
            if(err){ reject(err) }
            let data = Bunzip.decode(compressedData);

            fs.writeFile(`${config.d2Dir}/dota/replays/${matchID}.dem`, data, (err)=> {
                if(err){ reject(err) }

                console.log(`${matchID}.dem.bz2 was Decompressed`);
                resolve();
            });
        });
    })
}

/**
 * Calculate Game Start Tick and Write startmovie.cfg
 */
function calculateStartTick() {
    fs.access(`${config.d2Dir}/dota/${config.dotaLogFile}`, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(err){
            setTimeout(calculateStartTick, 3000);
        }else{
            fs.readFile(`${config.d2Dir}/dota/${config.dotaLogFile}`, 'utf-8', (err, data)=> {
                if(err){ onError(err) }
                let playbackTime = data.match(/playback_time: [0-9]*/i)[0].replace(/playback_time: /, '');
                let startGameTick = (parseInt(playbackTime) - parseInt(matchMeta.duration) - 145) * 30;

                console.log(`Game Start Tick was Calculated: ${startGameTick}`);

                fs.writeFile(`${config.d2Dir}/dota/cfg/startmovie.cfg`,
                    startMovieTmpl
                        .replace(/<-frames->/, `${config.recordMovie.recordFPS}`)
                        .replace(/<-startGameTick->/, `${startGameTick}`)
                        .replace(/<-recordStartTime->/, `${task.recordStartTime}`)
                        .replace(/<-heroIndex->/, `${task.heroIndex}`)
                        .replace(/<-specMode->/, `${config.recordMovie.specMode}`)
                        .replace(/<-recordToDir->/, `${config.recordMovie.recordToDir}`)
                        .replace(/<-maxRecordDuration->/, `${config.recordMovie.maxRecordDuration}`),
                    (err)=> {
                        if(err){ onError(err) }
                        console.log('Start Movie CFG was Set');
                    });
            });
        }
    });
}

/**
 * Terminate Dota 2 by Finite Frame
 */
function terminateByFrame(frame) {
    fs.access(frame, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(err){
            setTimeout(()=> { terminateByFrame(frame) }, 1000);
        }else {
            console.log('Frame exist -> Kill Dota 2');
            const killDota = spawn(`pkill`, [`-9`, `dota2`]);

            killDota.on('close', (code)=> {
                console.log(`pkill Dota Process Exited with Code: ${code}`);
            });
        }
    });
}

/**
 * Calculate Terminated Frame
 * @returns {string}
 */
function getTerminatedFrame(){
    let serialFrame = `${task.recordDuration * config.recordMovie.recordFPS}`;

    if(serialFrame.length == 4){ return serialFrame }

    let maxZeros = 4 - serialFrame.length;
    let zeros = '';

    for(let i = 0; i < maxZeros; i++){
        zeros += '0';
        if(i == maxZeros - 1){
            return zeros + serialFrame
        }
    }
}

/**
 * Error Logger
 * @param err
 */
function onError(err) {
    console.log(`Error Logger: ${err}`);
}

/**
 * Unlink Dota Log File condump000.txt for Test
 */
function unlinkLogAndFrames() {
    fs.access(`${config.d2Dir}/dota/${config.dotaLogFile}`, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(!err){
            fs.unlink(`${config.d2Dir}/dota/${config.dotaLogFile}`, (err)=> {
                if(err){ onError(err) }
                console.log(`Unlink ${config.dotaLogFile}`);
            });
        }
    });

    let path = `${config.d2Dir}/dota/test`;

    fs.access(path, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(!err){
            fs.readdir(path, (err, files)=> {
                if(err){ onError(err) }

                for(let file of files){
                    fs.unlink(`${path}/${file}`, (err)=> {
                        if(err){ onError(err) }
                    });

                    if(file === files[files.length - 1]){
                        fs.rmdir(path, (err)=> {
                            if(err){ onError(err) }
                            console.log(`Remove Movie Dir`);
                        });
                    }
                }
            });
        }
    });
}