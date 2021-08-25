const fs = require('fs-extra') // eslint-disable-line import/no-extraneous-dependencies
const path = require('path')

const moduleRoot = path.join(__dirname, '..')

const truffleConJsonDir = fs.readdirSync(path.join(moduleRoot, 'build', 'contracts'), 'utf8')
for (const truffleContractFile of truffleConJsonDir) {
  console.log(`Extracting abi from ${truffleContractFile}`)
  const { abi } = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'build', 'contracts', truffleContractFile), 'utf8'))
  fs.writeFileSync(path.join(moduleRoot, 'abis', truffleContractFile), JSON.stringify(abi), 'utf8')
}
