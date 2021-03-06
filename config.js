'use strict';

const config = {
  recordMovie: {
    maxRecordDuration : 350,
    recordToDir: 'test/testmovie',
    specMode : 3,
    recordFPS: 60
  },

  redis: {
    host: 'localhost',
    port: 6379,
    auth: false,
    prefix: 'dotagyff:'
  },

  secret: 'ElenaGolovach',
  port: 3000,
  bz2: './tmp/bz2',
  dem: './tmp/dem',
  dotaLogFile: 'condump000.txt',
  d2Dir: `/Users/vojjd/Library/Application\ Support/Steam/steamapps/common/dota\ 2\ beta/game`
};

module.exports = config;