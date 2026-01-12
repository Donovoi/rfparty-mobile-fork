const fs = require('fs')
const Path = require('path')
const debug = require('debug')('rfparty.build')

const RfpartyService = require('./rfparty-service')
const Pkg = require('../package.json')

async function main(){
  const service = new RfpartyService({ name: Pkg.name, version: Pkg.version })


  const outputDir = Path.join(__dirname, '../dataparty')
  fs.mkdirSync(outputDir, { recursive: true })
  const build = await service.compile(outputDir, true)

  debug('compiled')
}

main().catch(err=>{
  console.error('CRASH')
  console.error(err)
})
