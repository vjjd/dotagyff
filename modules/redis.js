'use strict';

const redis = require('redis');
const bluebird = require('bluebird');
const {port, host, auth} = require('../config').redis;

let client = redis.createClient(port, host);

if (auth) client.auth(auth);

client.on('error', err => { throw err });

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

module.exports = client;