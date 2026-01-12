#!/bin/bash

set -x

mkdir -p dataparty
mkdir -p www/nodejs-project/party

node ./party/rfparty-build.js
cp dataparty/*.json www/nodejs-project/party
ls -lah dataparty
