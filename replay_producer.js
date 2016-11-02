'use strict';

// Dependencies
let Dota2 = require('./modules/steam_login'),
    request = require('request'),
    Bunzip = require('seek-bzip'),
    config = require('./config'),
    fs = require('fs'),
    redis = require('./modules/redis');

const spawn = require('child_process').spawn;
const startMovieTmpl = fs.readFileSync('./templates/startmovie', 'utf-8');
const loadReplayTmpl = fs.readFileSync('./templates/loadreplay', 'utf-8');
let heroes = require('./heroes.json');

// Variables
let matchMeta = {
    "id": 2740558573,
    "heroName": "Clockwerk",
    "recordStartTime": 57750,
    "recordDuration": 5,
    "info": "",
    "heroIndex": ""
};

unlinkLogAndFrames();


//Main Stage
Dota2.on("ready", onD2Ready);

/**
 * Dota2 Client on Ready
 */
function onD2Ready() {
    console.log("Dota2 is Ready");

    Dota2.requestMatchDetails(matchMeta.id);
    Dota2.on("matchDetailsData", (matchId, matchData)=> {
        matchMeta.info = matchData;
        getPlayerIndex((index)=> {
            matchMeta.heroIndex = index;
        });

        redis.multi().keys(`*${matchMeta.id}`).execAsync()
            .then((res)=> {
                console.log(res);
                if(res[0].length == 0){
                    redis.set(`replay:${matchMeta.id}`, '');
                    fetchReplay(matchMeta.id, matchMeta.info)
                        .then(decompressBZ2, onError)
                        .then(dotaAction, onError);
                }else {
                    console.log('Dota action now');
                    dotaAction();
                }
            })
    });
}

/**
 * Action with Dota 2
 */
function dotaAction() {
    fs.writeFile(`${config.d2Dir}/dota/cfg/loadreplay.cfg`,
        loadReplayTmpl.replace(/<-demoFileID->/, `replays/${matchMeta.id}`),
        (err)=> {
            if(err){ onError(err) }
            const d2launch = spawn(`${config.d2Dir}/dota.sh`, ['-console -exec autoexec']);

            setTimeout(calculateStartTick, 50000);
            terminateByFrame(`${config.d2Dir}/dota/${config.recordMovie.recordToDir}${getTerminatedFrame()}.tga`);

            d2launch.on('close', (code) => {
                console.log(`Dota 2 Process Exited with Code: ${code}`);
                if(code === 0 || code === 137){ console.log(`Movie Recording is Done`) }
            });
        });
}

/**
 * Fetch Replay Data for Clip Recoding
 */
function fetchReplay(matchID, matchData) {
    return new Promise((resolve, reject)=> {
        let reqStream = request
            .get(`http://replay${matchData.match.cluster}.valve.net/570/`+
                `${matchID}_${matchData.match.replay_salt}.dem.bz2?v=1`)
            .on('error', (err)=>{
                if(err){ reject(err) }
            })
            .on('response', (res)=> {
                if(res.statusCode != 200){ reject(`Status Code: ${res.statusCode}`) }
            })
            .pipe(fs.createWriteStream(`${config.bz2}/${matchID}.dem.bz2`));

        reqStream.on('finish', ()=>{
            console.log(`Replay #${matchID} was Downloaded`);
            resolve(matchID);
        })
    })
}

/**
 * Decompress dem.bz2 Files
 * @param matchID
 * @returns {Promise}
 */
function decompressBZ2(matchID) {
    return new Promise((resolve, reject)=> {
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
 * Get Player Index
 * @returns {Promise}
 */
function getPlayerIndex(cb) {
    // return new Promise((resolve)=> {
        heroes.heroes.forEach((heroInfo)=> {
            if(matchMeta.heroName === heroInfo.localized_name){
                matchMeta.info.match.players.forEach((playerInfo, index)=> {
                    if(playerInfo.hero_id === heroInfo.id){
                        cb(index);
                    }
                });
            }
        });
    // });
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
                let startGameTick = (parseInt(playbackTime) - parseInt(matchMeta.info.match.duration) - 145) * 30;

                console.log('Game Start Tick was Calculated');

                fs.writeFile(`${config.d2Dir}/dota/cfg/startmovie.cfg`,
                    startMovieTmpl
                        .replace(/<-frames->/, `${config.recordMovie.recordFPS}`)
                        .replace(/<-startGameTick->/, `${startGameTick}`)
                        .replace(/<-recordStartTime->/, `${matchMeta.recordStartTime}`)
                        .replace(/<-heroIndex->/, `${matchMeta.heroIndex}`)
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
    let serialFrame = `${matchMeta.recordDuration * config.recordMovie.recordFPS}`;
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
    console.log(err);
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