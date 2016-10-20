'use strict';

// Dependencies
let Dota2 = require('./steam_login'),
    request = require('request'),
    Bunzip = require('seek-bzip'),
    config = require('./config'),
    fs = require('fs');

// Variables
let matchMeta = {
    "id": 2715475517,
    "heroName": "Vengeful Spirit",
    "info": ""
};

Dota2.on("ready", onD2Ready);

/**
 * Dota2 Client on Ready
 */
function onD2Ready() {
    console.log("Dota2 is Ready");

    Dota2.requestMatchDetails(matchMeta.id);
    Dota2.on("matchDetailsData", (matchId, matchData)=> {
        matchMeta.info = matchData;
        fetchReplay(matchMeta.id, matchMeta.info)
            .then(decompressBZ2, onError)
            .then(()=> {
                console.log(`Done`);
            }, onError);
    });
}

/**
 * Fetch Replay Data for Clip Recoding
 */
function fetchReplay(matchID, matchData) {
    return new Promise((resolve, reject)=> {
        let reqStream = request
            .get(`http://replay${matchData.match.cluster}.valve.net/570/${matchID}_${matchData.match.replay_salt}.dem.bz2?v=1`)
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

            fs.writeFile(`${config.dem}/${matchID}.dem`, data, (err)=> {
                if(err){ reject(err) }
                console.log(`${matchID}.dem.bz2 was Decompressed`);

                resolve();
            });
        });
    })
}

/**
 * Error Logger
 * @param err
 */
function onError(err) {
    console.log(err);
}