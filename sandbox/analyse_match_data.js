"use strict";

let request = require('request');
let fs = require('fs');
let matchData = require('./match_data.json'),
    heroes = require('./heroes.json'),
    heroName = 'Vengeful Spirit',
    matchID = 2715475517;

// Variables
let matchMeta = {
    "id": 2721505211,
    "heroName": "Vengeful Spirit",
    "info": "",
    "heroIndex": "",
    "recordStartTime": 33750
};
matchMeta.info = matchData;

getPlayerIndex((i)=> {console.log(i)});

function getPlayerIndex(cb) {
    heroes.heroes.forEach((heroInfo)=> {
        if(matchMeta.heroName === heroInfo.localized_name){
            console.log();
            matchMeta.info.match.players.forEach((playerInfo, index)=> {
                if(playerInfo.hero_id === heroInfo.id){
                    cb(index);
                }
            });
        }
    });
}




/**
 * Fetch Index for "dota_spectator_hero_index" Replay Command
 */
// findHeroID(heroName, (id)=> {
//     findPlayerIndex(id, (index)=> {
//         console.log(index);
//     });
// });

// function getHeroID(heroName, cb) {
//     heroes.heroes.forEach((heroInfo)=> {
//         if(heroName === heroInfo.localized_name){ cb(heroInfo.id) }
//     });
// }
//
// function getPlayerIndex(id, cb) {
//     matchData.match.players.forEach((playerInfo, index)=> {
//         if(playerInfo.hero_id === id){
//             cb(index);
//         }
//     });
// }

/**
 * Fetch Replay Data for Clip Recoding
 */
// fetchReplay(matchID);

function fetchReplay(matchID) {
    request
        .get(`http://replay${matchData.match.cluster}.valve.net/570/${matchID}_${matchData.match.replay_salt}.dem.bz2?v=1`)
        .on('response', (res)=> {
            if(res.statusCode != 200){ onError(`Bad Request. Status Code: ${res.statusCode}`) }
        })
        .pipe(fs.createWriteStream(`${matchID}.dem.bz2`));
}

function onError(err) {
    console.log(err);
}