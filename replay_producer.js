'use strict';

let
    Dota2 = require('./modules/steam_login'),
    request = require('request'),
    Bunzip = require('seek-bzip'),
    config = require('./config'),
    fs = require('fs'),
    redis = require('./modules/redis'),
    heroes = require('./heroes.json'),
    ffmpeg = require('fluent-ffmpeg');

const
    spawn = require('child_process').spawn,
    crypto = require('crypto'),
    startMovieTmpl = fs.readFileSync('./templates/startmovie', 'utf-8'),
    loadReplayTmpl = fs.readFileSync('./templates/loadreplay', 'utf-8');

let task = {
    "heroName": "Faceless Void",
    "id": 2752071280,
    "recordStartTime": 66750,
    "recordDuration": 15,
    "heroIndex": "",
    "status": "during",
    "hash": "",

    "matchMeta": {
        "players": [],
        "duration": '',
        "cluster": '',
        "replay_salt": ''
    }
};

start();

function start() {
    calculateTaskHash().then(()=> {
        redis.getAsync(`replay:${task.id}`)
            .then((res)=> {
                if (res) {
                    task.matchMeta = JSON.parse(res);

                    getPlayerIndex()
                        .then((index)=> {
                            task.heroIndex = index;
                            dotaAction();
                        });
                } else {
                    Dota2.on("ready", onD2Ready)
                }
            });
    });

    function onD2Ready() {
        getMatchDetails()
            .then(()=> {
                redis.set(`replay:${task.id}`,
                    JSON.stringify(task.matchMeta));
            })
            .then(getPlayerIndex)
            .then((index)=> {
                task.heroIndex = index;
            })
            .then(fetchReplay, onError)
            .then(decompressBZ2, onError)
            .then(dotaAction, onError)
            .then(()=> {
                let optionGetKey = {
                    method: 'POST',
                    url: 'https://api.gfycat.com/v1/gfycats',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: {
                        "noMd5" : "false", //def:true
                        "noResize" : "true",
                        "captions": [
                            {
                                "startSeconds":0,
                                "duration": 15,
                                "text": "caption"
                            }
                        ]
                    },
                };

                let path = '/Users/vojjd/Desktop';
                let name = task.hash;
                console.log(`Name: ${name}`);

                request.post(optionGetKey, (err, res, body)=> {
                    if (!err && res.statusCode == 200) {
                        console.log(`Receive result: ${body}`);

                        let newName = JSON.parse(body).gfyname;
                        console.log(`New name: ${newName}`);

                        fs.rename(`${path}/${name}.mp4`, `${path}/${newName}`, (err)=> {
                            if (err) { console.log(`Error Logger: ${err}`) }

                            console.log(`${path}/${newName}`);
                            const curlReq = spawn(`curl`, [`-i`, `https://filedrop.gfycat.com`, `--upload-file`, `${path}/${newName}`]);

                            curlReq.stdout.on('data', (data)=> { console.log(`out: ${data}`) });
                            //curlReq.stderr.on('data', (data)=> { console.log(`process: ${data}`) });

                            curlReq.on('close', (code)=> {
                                console.log(`Curl Exit with Code: ${code}`);

                                if(code === 0){
                                    request.get(`https://api.gfycat.com/v1/gfycats/fetch/status/${newName}`, (err, res, body)=> {
                                        if(!err && res.statusCode == 200) {
                                            console.log(`body: ${body}`);
                                        }
                                    });
                                }
                            });
                        });
                    }
                });
            });
    }
}

function calculateTaskHash() {
    return new Promise((resolve)=> {
        const hmac = new crypto.createHmac('MD5', config.secret);
        hmac.update(JSON.stringify(task));

        task.hash = hmac.digest('hex');
        console.log(`Hash was Calculated: ${task.hash}`);
        resolve();
    });
}

/**
 * Fetch Match Details
 * @returns {Promise}
 */
function  getMatchDetails() {
    return new Promise((resolve)=> {
        Dota2.requestMatchDetails(task.id);
        Dota2.on("matchDetailsData", (matchId, matchData)=> {
            task.matchMeta.players = matchData.match.players.map((player)=> {
                return {
                    "account_id": player.account_id,
                    "hero_id": player.hero_id,
                    "player_name": player.player_name,
                    "player_slot": player.player_slot
                };
            });
            task.matchMeta.replay_salt = matchData.match.replay_salt;
            task.matchMeta.cluster = matchData.match.cluster;
            task.matchMeta.duration = matchData.match.duration;

            resolve();
        });
    });
}

/**
 * Get Player Index
 * @returns {Promise}
 */
function getPlayerIndex() {
    return new Promise((resolve)=> {
        heroes.heroes.forEach((heroInfo)=> {
            if(task.heroName === heroInfo.localized_name){
                task.matchMeta.players.forEach((playerInfo, index)=> {
                    if(playerInfo.hero_id === heroInfo.id){
                        resolve(index);
                    }
                });
            }
        });
    });
}

/**
 * Fetch Replay Data for Clip Recoding
 * @returns {Promise}
 */
function fetchReplay() {
    return new Promise((resolve, reject)=> {
        let matchID = task.id;
        let reqStream = request
            .get(`http://replay${task.matchMeta.cluster}.valve.net/570/`+
                `${matchID}_${task.matchMeta.replay_salt}.dem.bz2?v=1`)
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
 * Action with Dota 2
 */
function dotaAction() {
    return new Promise((resolve, reject)=> {
    fs.writeFile(`${config.d2Dir}/dota/cfg/loadreplay.cfg`,
        loadReplayTmpl.replace(/<-demoFileID->/, `replays/${task.id}`),
        (err)=> {
            if(err){ onError(err) }
            unlinkLog()
                .then(unlinkFrames, onError)
                .then(()=> {
                    const d2launch = spawn(`${config.d2Dir}/dota.sh`, ['-console -exec autoexec']);

                    setTimeout(calculateStartTick, 50000);
                    terminateByFrame(`${config.d2Dir}/dota/`+`${task.hash}/testmovie${getTerminatedFrame()}.tga`);
                    console.log(`Movie Recording will be Terminate by Frame#${getTerminatedFrame()}.tga`);

                    d2launch.on('close', (code) => {
                        console.log(`Dota 2 Process Exited with Code: ${code}`);
                        if (code === 0 || code === 137) {
                            console.log(`Movie Recording is Done`);

                            console.log('start ffpmeg');
                            new ffmpeg(`${config.d2Dir}/dota/${task.hash}/testmovie%4d.tga`)
                                .withInputFps('60')
                                .withVideoCodec('libx264')
                                .addOption(['-crf 4', '-pix_fmt yuv420p'])
                                .saveToFile(`/Users/vojjd/Desktop/${task.hash}.mp4`)
                                //.withVideoCodec('libvpx')
                                //.size(('70%'))
                                //.addOption(['-b:v 0', '-crf 22'])
                                //.saveToFile('/Users/vojjd/Desktop/SniperMovie.webm')
                                .on('end', ()=> {
                                    task.status = 'ffmpeg done';
                                    console.log(`End. Task Status: ${task.status}`);
                                    resolve();
                                });
                        }else{
                            reject(`Dota 2 Terminated with Code: ${code}`)
                        }
                });
            });
        });
    });
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
                let startGameTick = (parseInt(playbackTime) - parseInt(task.matchMeta.duration) - 145) * 30;

                console.log(`Game Start Tick was Calculated: ${startGameTick}`);

                fs.writeFile(`${config.d2Dir}/dota/cfg/startmovie.cfg`,
                    startMovieTmpl
                        .replace(/<-frames->/, `${config.recordMovie.recordFPS}`)
                        .replace(/<-startGameTick->/, `${startGameTick}`)
                        .replace(/<-recordStartTime->/, `${task.recordStartTime}`)
                        .replace(/<-heroIndex->/, `${task.heroIndex}`)
                        .replace(/<-specMode->/, `${config.recordMovie.specMode}`)
                        .replace(/<-recordToDir->/, `${task.hash}/testmovie`) //${config.recordMovie.recordToDir}
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
 * Unlink Dota Log File condump000.txt for Test
 */
function unlinkLog(){
    return new Promise((resolve, reject)=> {
        fs.access(`${config.d2Dir}/dota/${config.dotaLogFile}`, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
            if(err) {
                resolve()
            }else {
                fs.unlink(`${config.d2Dir}/dota/${config.dotaLogFile}`, (err)=> {
                    if(err){ reject(err) }
                    console.log(`Unlink ${config.dotaLogFile}`);
                    resolve();
                });
            }
        });
    });
}

/**
 * Unlink Movie Frames
 * @returns {Promise}
 */
function unlinkFrames() {
    return new Promise((resolve, reject)=> {
        let path = `${config.d2Dir}/dota/${task.hash}`;

        function rmDir(path) {
            fs.rmdir(path, (err)=> {
                if(err){ reject (err) }
                console.log(`Remove Movie Dir`);
                resolve();
            });
        }

        fs.access(path, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
            if(err){
                resolve()
            }else {
                fs.readdir(path, (err, files)=> {
                    if(err){ reject(err) }
                    if(files.length){
                        for(let file of files){
                            fs.unlink(`${path}/${file}`, (err)=> {
                                if(err){ reject(err) }
                            });

                            if(file == files[files.length - 1]){
                                rmDir(path);
                            }
                        }
                    }else {
                        rmDir(path);
                    }
                });
            }
        });
    });
}

/**
 * Error Logger
 * @param err
 */
function onError(err) {
    console.log(`Error Logger: ${err}`);
}