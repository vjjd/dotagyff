'use strict';

let steam = require("steam"),
    util = require("util"),
    fs = require("fs"),
    crypto = require("crypto"),
    dota2 = require("dota2"),
    steamClient = new steam.SteamClient(),
    steamUser = new steam.SteamUser(steamClient),
    Dota2 = new dota2.Dota2Client(steamClient, true);

global.config = require("./steam_config");

/**
 * Steam Login
 * @param logonResp
 */
let onSteamLogOn = function onSteamLogOn(logonResp) {
    if (logonResp.eresult == steam.EResult.OK) {
        util.log("Logged on.");
        Dota2.launch();
    }
},
    onSteamServers = function onSteamServers(servers) {
        util.log("Received servers.");
        fs.writeFile('servers', JSON.stringify(servers));
    },
    onSteamLogOff = function onSteamLogOff(eresult) {
        util.log("Logged off from Steam.");
    },
    onSteamError = function onSteamError(error) {
        util.log("Connection closed by server.");
    };

steamUser.on('updateMachineAuth', function(sentry, callback) {
    let hashedSentry = crypto.createHash('sha1').update(sentry.bytes).digest();
    fs.writeFileSync('sentry', hashedSentry);
    util.log("sentryfile saved");

    callback({ sha_file: hashedSentry});
});

let logOnDetails = {
    "account_name": global.config.steam_user,
    "password": global.config.steam_pass,
};
if (global.config.steam_guard_code) logOnDetails.auth_code = global.config.steam_guard_code;

try {
    let sentry = fs.readFileSync('sentry');
    if (sentry.length) logOnDetails.sha_sentryfile = sentry;
}
catch (beef){
    util.log("Cannot load the sentry. " + beef);
}

steamClient.connect();

steamClient.on('connected', function() {
    steamUser.logOn(logOnDetails);
});

steamClient.on('logOnResponse', onSteamLogOn);
steamClient.on('loggedOff', onSteamLogOff);
steamClient.on('error', onSteamError);
steamClient.on('servers', onSteamServers);

module.exports = Dota2;