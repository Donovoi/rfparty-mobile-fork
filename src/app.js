
import {MainWindow} from './main-window'

import { RFParty } from './rfparty'

const JSONPath = require('jsonpath-plus').JSONPath


function bootLog(message){
  if (window.__bootLog) {
    window.__bootLog(message)
  }
}

bootLog('boot: app.js loaded')
window.__booted = true


window.JSONPath = JSONPath
window.rfparty = null
window.RFParty = RFParty
window.MainWindow = MainWindow

const Dataparty = window.Dataparty
if (!Dataparty) {
  console.error('Dataparty library not loaded. Check dataparty-browser.js.')
  bootLog('boot: Dataparty missing')
}

window.Dataparty = Dataparty

function channelListener(msg) {
  console.log('[cordova] received:' + msg);
}

function ondebug(msg){
  console.log(msg)
}

function onerror(msg){
  console.log('error', msg)
  console.error(msg)
}


async function main(channel){
  console.log('app.js - main()')
  bootLog('boot: main()')

  try{
    await MainWindow.onload('map', channel)
    bootLog('boot: MainWindow.onload complete')
  }
  catch(err){
    console.log('error', err)
    bootLog('boot: main error ' + (err && err.message ? err.message : String(err)))
  }

}


let readyStarted = false

async function ready() {
  if (readyStarted) {
    return
  }
  readyStarted = true
  bootLog('boot: deviceready fired')
    
 let channel = undefined

 try{
  channel = nodejs.channel
 } catch (err){
  console.log('app running without nodejs')
 }
 
 if(channel){
    nodejs.channel.setListener(channelListener)
    nodejs.channel.on('debug', ondebug)
    nodejs.channel.on('error', onerror)
 }

  try{
    await main(channel).catch(err=>{
      console.log('ERROR - app.js main catch' + JSON.stringify(err,null,2), err)
      bootLog('boot: main catch ' + (err && err.message ? err.message : String(err)))
    }).then(()=>{
      console.log('finished app.js')
      bootLog('boot: finished app.js')
    })
  }catch(err){
    console.error('exception', err)
    bootLog('boot: ready exception ' + (err && err.message ? err.message : String(err)))
  }
}


function registerDeviceReady() {
  if (window.cordova && window.cordova.channel && window.cordova.channel.onDeviceReady && window.cordova.channel.onDeviceReady.fired) {
    console.log('deviceready already fired, starting app')
    ready()
    return
  }

  document.addEventListener('deviceready', ready, false)
}

registerDeviceReady()
