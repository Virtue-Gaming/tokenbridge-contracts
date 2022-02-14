const assert = require('assert')
const Web3Utils = require('web3-utils')
const env = require('../loadEnv')

const { deployContract, privateKeyToAddress, sendRawTxHome } = require('../deploymentUtils')
const { web3Home, deploymentPrivateKey, HOME_RPC_URL } = require('../web3')

const {
  homeContracts: {
    CustomizableERC677BridgeToken
  }
} = require('../loadContracts')

const {
  DEPLOYMENT_ACCOUNT_PRIVATE_KEY,
  BRIDGEABLE_TOKEN_NAME,
  BRIDGEABLE_TOKEN_SYMBOL,
  BRIDGEABLE_TOKEN_DECIMALS,
  TOKEN_OWNER
} = env

const DEPLOYMENT_ACCOUNT_ADDRESS = privateKeyToAddress(DEPLOYMENT_ACCOUNT_PRIVATE_KEY)

async function deployToken() {
  console.log('Deploying token contract')
  let homeNonce = await web3Home.eth.getTransactionCount(DEPLOYMENT_ACCOUNT_ADDRESS)
  const tokenContract = await deployContract(
    CustomizableERC677BridgeToken,
    [BRIDGEABLE_TOKEN_NAME, BRIDGEABLE_TOKEN_SYMBOL, BRIDGEABLE_TOKEN_DECIMALS],
    {
      from: DEPLOYMENT_ACCOUNT_ADDRESS,
      nonce: homeNonce
    }
  )
  console.log('[Home] Token: ', tokenContract.options.address)
  homeNonce++

  console.log('transferring ownership of Token to Token owner')
  const txTokenOwnershipData = await tokenContract.methods
    .transferOwnership(TOKEN_OWNER)
    .encodeABI({ from: DEPLOYMENT_ACCOUNT_ADDRESS })
  const txTokenOwnership = await sendRawTxHome({
    data: txTokenOwnershipData,
    nonce: homeNonce,
    to: tokenContract.options.address,
    privateKey: deploymentPrivateKey,
    url: HOME_RPC_URL
  })
  assert.strictEqual(Web3Utils.hexToNumber(txTokenOwnership.status), 1, 'Transaction Failed')
  homeNonce++

  console.log('\nHome Deployment Token completed\n')
  return {
    token: { address: tokenContract.options.address }
  }
}

module.exports = deployToken
