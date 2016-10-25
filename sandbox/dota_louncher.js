'use strict';

let fs = require('fs');
let config = require('./../config.json');
const spawn = require('child_process').spawn;

let d2Dir = `/Users/vojjd/Library/Application\ Support/Steam/steamapps/common/dota\ 2\ beta/game`;
let matchMeta = {
    "info": {
        "match": {
            "duration": 1446
        }
    }
};

start();

function start() {
    const d2 = spawn('/Users/vojjd/Library/Application\ Support/Steam/steamapps/common/dota\ 2\ beta/game/dota.sh', ['-console -exec autoexec']);

    setTimeout(startTimeCalculator, 50000);

    d2.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });

}

function startTimeCalculator() {
    fs.access(`${d2Dir}/dota/${config.dotaLogFile}`, fs.constants.R_OK | fs.constants.W_OK, (err)=> {
        if(err){
            setTimeout(startTimeCalculator, 3000);
        }else{
            fs.readFile(`${d2Dir}/dota/${config.dotaLogFile}`, 'utf-8', (err, data)=> {
                if(err){ onError(err) }
                let playbackTime = data.match(/playback_time: [0-9]*/i)[0].replace(/playback_time: /, '');
                let startTick = (parseInt(playbackTime) - parseInt(matchMeta.info.match.duration) - 145) * 30;
                fs.writeFile(`${d2Dir}/dota/cfg/startmovie.cfg`, `alias -3.000000 "";
alias 4000.000000 "#stop; demo_gototick 0 pause; blink execute_command_every_frame 20 -2 4001";
alias 4001.000000 "#stop; demo_gototick ${startTick} relative pause; blink execute_command_every_frame 20 -2 4002";
alias 4002.000000 "#stop; demo_resume; startmovie test/testmovie; blink execute_command_every_frame 40 -2 4003"
alias 4003.000000 "#stop; endmovie; quit";
#stop;blink execute_command_every_frame 5 -3 4000; //start the countdown`,
                    (err)=> {
                        if(err){ onError(err) }
                        console.log('Start Tick was Calculated');
                    });
            });
        }
    });
}

function onError(err) {
    console.log(err);
}