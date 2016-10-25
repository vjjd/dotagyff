'use strict';

// Dependencies
let Dota2 = require('./steam_login'),
    request = require('request'),
    Bunzip = require('seek-bzip'),
    config = require('./config'),
    fs = require('fs');

const spawn = require('child_process').spawn;
const startMovieTmpl = fs.readFileSync('./templates/startmovie', 'utf-8');
const loadReplayTmpl = fs.readFileSync('./templates/loadreplay', 'utf-8');
let startMovieConfig = require('./startmovie_config.json');
let heroes = require('./heroes.json');

// Variables
let d2Dir = `/Users/vojjd/Library/Application\ Support/Steam/steamapps/common/dota\ 2\ beta/game`;
let matchMeta = {
    "id": 2721505211,
    "heroName": "Queen of Pain",
    "recordStartTime": 33300,
    "info": "",
    "heroIndex": ""
};

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
            matchMeta.heroIndex = index
        });

        fetchReplay(matchMeta.id, matchMeta.info)
            .then(decompressBZ2, onError)
            .then(()=> {
                fs.writeFile(`${d2Dir}/dota/cfg/loadreplay.cfg`,
                    loadReplayTmpl.replace(/<-demoFile->/, `replays/${matchMeta.id}`),
                    (err)=> {
                        if(err){ onError(err) }
                        const d2launch = spawn(`${d2Dir}/dota.sh`, ['-console -exec autoexec']);

                        setTimeout(calculateStartTick, 50000);

                        d2launch.on('close', (code) => {
                            console.log(`Child Process Exited with Code: ${code}`);
                            console.log(`Movie Recording is Done`);
                        });
                });
            }, onError);
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

            fs.writeFile(`${d2Dir}/dota/replays/${matchID}.dem`, data, (err)=> {
                if(err){ reject(err) }

                console.log(`${matchID}.dem.bz2 was Decompressed`)
                resolve();
            });
        });
    })
}

/**
 * Calculate Start Tick and Write startmovie.cfg
 */
function calculateStartTick() {
    fs.access(`${d2Dir}/dota/${config.dotaLogFile}`, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(err){
            setTimeout(calculateStartTick, 3000);
        }else{
            fs.readFile(`${d2Dir}/dota/${config.dotaLogFile}`, 'utf-8', (err, data)=> {
                if(err){ onError(err) }
                let playbackTime = data.match(/playback_time: [0-9]*/i)[0].replace(/playback_time: /, '');
                let startGameTick = (parseInt(playbackTime) - parseInt(matchMeta.info.match.duration) - 145) * 30;

                console.log('Start Tick was Calculated');

                fs.writeFile(`${d2Dir}/dota/cfg/startmovie.cfg`,
                    startMovieTmpl
                        .replace(/<-frames->/, `${startMovieConfig.recordFPS}`)
                        .replace(/<-startGameTick->/, `${startGameTick}`)
                        .replace(/<-recordStartTime->/, `${matchMeta.recordStartTime}`)
                        .replace(/<-heroIndex->/, `${matchMeta.heroIndex}`)
                        .replace(/<-specMode->/, `${startMovieConfig.specMode}`)
                        .replace(/<-recordToDir->/, `${startMovieConfig.recordToDir}`)
                        .replace(/<-recordDuration->/, `${startMovieConfig.recordDuration}`),
                    (err)=> {
                        if(err){ onError(err) }
                        console.log('Start Movie CFG was Set');
                    });
            });
        }
    });
}

/**
 * Get Player Index
 * @param cb
 */
function getPlayerIndex(cb) {
    heroes.heroes.forEach((heroInfo)=> {
        if(matchMeta.heroName === heroInfo.localized_name){
            matchMeta.info.match.players.forEach((playerInfo, index)=> {
                if(playerInfo.hero_id === heroInfo.id){
                    cb(index);
                }
            });
        }
    });
}

/**
 * Error Logger
 * @param err
 */
function onError(err) {
    console.log(err);
}