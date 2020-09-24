const ForeignBridge = artifacts.require('ForeignBridgeInvertedNativeToErc.sol')
const BridgeValidators = artifacts.require('BridgeValidators.sol')
const EternalStorageProxy = artifacts.require('EternalStorageProxy.sol')
const ERC677BridgeToken = artifacts.require('ERC677BridgeToken.sol')
const ForeignBridgeV2 = artifacts.require('ForeignBridgeV2.sol')

const { expect } = require('chai')
const { ERROR_MSG, ZERO_ADDRESS, toBN } = require('../setup')
const { createMessage, sign, signatureToVRS, ether, expectEventInLogs } = require('../helpers/helpers')

const oneEther = ether('1')
const halfEther = ether('0.5')
const minPerTx = ether('0.01')
const dailyLimit = ether('10')
const requireBlockConfirmations = 8
const gasPrice = web3.utils.toWei('1', 'gwei')
const homeDailyLimit = oneEther
const homeMaxPerTx = halfEther
const maxPerTx = halfEther
const ZERO = toBN(0)

contract('ForeignBridge_Inverted_Native_to_ERC20', async accounts => {
  let validatorContract
  let authorities
  let owner
  before(async () => {
    validatorContract = await BridgeValidators.new()
    authorities = [accounts[1], accounts[2]]
    owner = accounts[0]
    await validatorContract.initialize(1, authorities, owner)
  })

  describe('#initialize', async () => {
    it('should initialize', async () => {
      const foreignBridge = await ForeignBridge.new()

      expect(await foreignBridge.validatorContract()).to.be.equal(ZERO_ADDRESS)
      expect(await foreignBridge.deployedAtBlock()).to.be.bignumber.equal(ZERO)
      expect(await foreignBridge.isInitialized()).to.be.equal(false)
      expect(await foreignBridge.requiredBlockConfirmations()).to.be.bignumber.equal(ZERO)

      await foreignBridge
        .initialize(
          ZERO_ADDRESS,
          dailyLimit,
          maxPerTx,
          minPerTx,
          gasPrice,
          requireBlockConfirmations,
          homeDailyLimit,
          homeMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge
        .initialize(
          validatorContract.address,
          dailyLimit,
          maxPerTx,
          minPerTx,
          gasPrice,
          requireBlockConfirmations,
          homeDailyLimit,
          homeMaxPerTx,
          ZERO_ADDRESS
        )
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge
        .initialize(
          validatorContract.address,
          dailyLimit,
          maxPerTx,
          minPerTx,
          gasPrice,
          0,
          homeDailyLimit,
          homeMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge
        .initialize(
          validatorContract.address,
          dailyLimit,
          maxPerTx,
          minPerTx,
          0,
          requireBlockConfirmations,
          homeDailyLimit,
          homeMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge
        .initialize(
          owner,
          dailyLimit,
          maxPerTx,
          minPerTx,
          gasPrice,
          requireBlockConfirmations,
          homeDailyLimit,
          homeMaxPerTx,
          owner
        )
        .should.be.rejectedWith(ERROR_MSG)

      const { logs } = await foreignBridge.initialize(
        validatorContract.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )

      expect(await foreignBridge.isInitialized()).to.be.equal(true)
      expect(await foreignBridge.validatorContract()).to.be.equal(validatorContract.address)
      expect(await foreignBridge.deployedAtBlock()).to.be.bignumber.above(ZERO)
      expect(await foreignBridge.requiredBlockConfirmations()).to.be.bignumber.equal(
        requireBlockConfirmations.toString()
      )
      expect(await foreignBridge.gasPrice()).to.be.bignumber.equal(gasPrice)
      expect(await foreignBridge.dailyLimit()).to.be.bignumber.equal(dailyLimit)
      expect(await foreignBridge.maxPerTx()).to.be.bignumber.equal(maxPerTx)
      expect(await foreignBridge.minPerTx()).to.be.bignumber.equal(minPerTx)
      const bridgeMode = '0x2d559eed' // 4 bytes of keccak256('inverted-native-to-erc-core')
      expect(await foreignBridge.getBridgeMode()).to.be.equal(bridgeMode)
      const { major, minor, patch } = await foreignBridge.getBridgeInterfacesVersion()
      expect(major).to.be.bignumber.gte(ZERO)
      expect(minor).to.be.bignumber.gte(ZERO)
      expect(patch).to.be.bignumber.gte(ZERO)

      expectEventInLogs(logs, 'RequiredBlockConfirmationChanged', {
        requiredBlockConfirmations: toBN(requireBlockConfirmations)
      })
      expectEventInLogs(logs, 'GasPriceChanged', { gasPrice })
      expectEventInLogs(logs, 'ExecutionDailyLimitChanged', { newLimit: homeDailyLimit })
      expectEventInLogs(logs, 'DailyLimitChanged', { newLimit: dailyLimit })
    })
  })
  describe('#fallback', async () => {
    let foreignBridge

    beforeEach(async () => {
      foreignBridge = await ForeignBridge.new()
      await foreignBridge.initialize(
        validatorContract.address,
        '3',
        '2',
        '1',
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )
    })
    it('should accept native coins', async () => {
      const currentDay = await foreignBridge.getCurrentDay()
      expect(await foreignBridge.totalSpentPerDay(currentDay)).to.be.bignumber.equal(ZERO)

      const { logs } = await foreignBridge.sendTransaction({
        from: accounts[1],
        value: 1
      }).should.be.fulfilled
      expect(await foreignBridge.totalSpentPerDay(currentDay)).to.be.bignumber.equal('1')

      expectEventInLogs(logs, 'UserRequestForAffirmation', { recipient: accounts[1], value: toBN(1) })

      await foreignBridge
        .sendTransaction({
          from: accounts[1],
          value: 3
        })
        .should.be.rejectedWith(ERROR_MSG)

      await foreignBridge.setDailyLimit(4).should.be.fulfilled
      await foreignBridge.sendTransaction({
        from: accounts[1],
        value: 1
      }).should.be.fulfilled

      expect(await foreignBridge.totalSpentPerDay(currentDay)).to.be.bignumber.equal('2')
    })

    it('doesnt let you send more than max amount per tx', async () => {
      await foreignBridge.sendTransaction({
        from: accounts[1],
        value: 1
      }).should.be.fulfilled
      await foreignBridge
        .sendTransaction({
          from: accounts[1],
          value: 3
        })
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge.setMaxPerTx(100).should.be.rejectedWith(ERROR_MSG)
      await foreignBridge.setDailyLimit(100).should.be.fulfilled
      await foreignBridge.setMaxPerTx(99).should.be.fulfilled
      // meets max per tx and daily limit
      await foreignBridge.sendTransaction({
        from: accounts[1],
        value: 99
      }).should.be.fulfilled
      // above daily limit
      await foreignBridge
        .sendTransaction({
          from: accounts[1],
          value: 1
        })
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('should not let to deposit less than minPerTx', async () => {
      const newDailyLimit = 100
      const newMaxPerTx = 50
      const newMinPerTx = 20
      await foreignBridge.setDailyLimit(newDailyLimit).should.be.fulfilled
      await foreignBridge.setMaxPerTx(newMaxPerTx).should.be.fulfilled
      await foreignBridge.setMinPerTx(newMinPerTx).should.be.fulfilled

      await foreignBridge.sendTransaction({
        from: accounts[1],
        value: newMinPerTx
      }).should.be.fulfilled
      await foreignBridge
        .sendTransaction({
          from: accounts[1],
          value: newMinPerTx - 1
        })
        .should.be.rejectedWith(ERROR_MSG)
    })
  })
  describe('#executeSignatures', async () => {
    const value = ether('0.25')
    let foreignBridge
    beforeEach(async () => {
      foreignBridge = await ForeignBridge.new()
      await foreignBridge.initialize(
        validatorContract.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )
      await foreignBridge.sendTransaction({
        from: accounts[2],
        value
      }).should.be.fulfilled
    })
    it('should allow to executeSignatures', async () => {
      const recipientAccount = accounts[3]

      const balanceBefore = toBN(await web3.eth.getBalance(recipientAccount))

      const transactionHash = '0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80'
      const message = createMessage(recipientAccount, value, transactionHash, foreignBridge.address)
      const signature = await sign(authorities[0], message)
      const vrs = signatureToVRS(signature)
      false.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
      const { logs } = await foreignBridge.executeSignatures([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      logs[0].event.should.be.equal('RelayedMessage')
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)

      const balanceAfter = toBN(await web3.eth.getBalance(recipientAccount))
      const balanceAfterBridge = toBN(await web3.eth.getBalance(foreignBridge.address))
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value))
      balanceAfterBridge.should.be.bignumber.equal(ZERO)
      true.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
    })
    it('should allow second withdrawal with different transactionHash but same recipient and value', async () => {
      const recipientAccount = accounts[3]
      const balanceBefore = toBN(await web3.eth.getBalance(recipientAccount))
      // tx 1
      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, value, transactionHash, foreignBridge.address)
      const signature = await sign(authorities[0], message)
      const vrs = signatureToVRS(signature)
      false.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
      await foreignBridge.executeSignatures([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      // tx 2
      await foreignBridge.sendTransaction({
        from: accounts[2],
        value
      }).should.be.fulfilled
      const transactionHash2 = '0x77a496628a776a03d58d7e6059a5937f04bebd8ba4ff89f76dd4bb8ba7e291ee'
      const message2 = createMessage(recipientAccount, value, transactionHash2, foreignBridge.address)
      const signature2 = await sign(authorities[0], message2)
      const vrs2 = signatureToVRS(signature2)
      false.should.be.equal(await foreignBridge.relayedMessages(transactionHash2))
      const { logs } = await foreignBridge.executeSignatures([vrs2.v], [vrs2.r], [vrs2.s], message2).should.be.fulfilled

      logs[0].event.should.be.equal('RelayedMessage')
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      const balanceAfter = await toBN(await web3.eth.getBalance(recipientAccount))
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(value.mul(toBN(2))))
      true.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
      true.should.be.equal(await foreignBridge.relayedMessages(transactionHash2))
    })

    it('should not allow second withdraw (replay attack) with same transactionHash but different recipient', async () => {
      const recipientAccount = accounts[3]
      // tx 1
      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, value, transactionHash, foreignBridge.address)
      const signature = await sign(authorities[0], message)
      const vrs = signatureToVRS(signature)
      false.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
      await foreignBridge.executeSignatures([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled
      // tx 2
      await foreignBridge.sendTransaction({
        from: accounts[2],
        value
      }).should.be.fulfilled
      const message2 = createMessage(accounts[4], value, transactionHash, foreignBridge.address)
      const signature2 = await sign(authorities[0], message2)
      const vrs2 = signatureToVRS(signature2)
      true.should.be.equal(await foreignBridge.relayedMessages(transactionHash))
      await foreignBridge.executeSignatures([vrs2.v], [vrs2.r], [vrs2.s], message2).should.be.rejectedWith(ERROR_MSG)
    })

    it('should not allow withdraw over home max tx limit', async () => {
      const recipientAccount = accounts[3]
      const invalidValue = ether('0.75')
      for (let i = 0; i < 2; i++) {
        await foreignBridge.sendTransaction({
          from: accounts[2],
          value: halfEther
        }).should.be.fulfilled
      }

      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, invalidValue, transactionHash, foreignBridge.address)
      const signature = await sign(authorities[0], message)
      const vrs = signatureToVRS(signature)

      await foreignBridge.executeSignatures([vrs.v], [vrs.r], [vrs.s], message).should.be.rejectedWith(ERROR_MSG)
    })

    it('should not allow withdraw over daily home limit', async () => {
      const recipientAccount = accounts[3]
      for (let i = 0; i < 5; i++) {
        await foreignBridge.sendTransaction({
          from: accounts[2],
          value: halfEther
        }).should.be.fulfilled
      }

      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, halfEther, transactionHash, foreignBridge.address)
      const signature = await sign(authorities[0], message)
      const vrs = signatureToVRS(signature)

      await foreignBridge.executeSignatures([vrs.v], [vrs.r], [vrs.s], message).should.be.fulfilled

      const transactionHash2 = '0x69debd8fd1923c9cb3cd8ef6461e2740b2d037943b941729d5a47671a2bb8712'
      const message2 = createMessage(recipientAccount, halfEther, transactionHash2, foreignBridge.address)
      const signature2 = await sign(authorities[0], message2)
      const vrs2 = signatureToVRS(signature2)

      await foreignBridge.executeSignatures([vrs2.v], [vrs2.r], [vrs2.s], message2).should.be.fulfilled

      const transactionHash3 = '0x022695428093bb292db8e48bd1417c5e1b84c0bf673bd0fff23ed0fb6495b872'
      const message3 = createMessage(recipientAccount, halfEther, transactionHash3, foreignBridge.address)
      const signature3 = await sign(authorities[0], message3)
      const vrs3 = signatureToVRS(signature3)

      await foreignBridge.executeSignatures([vrs3.v], [vrs3.r], [vrs3.s], message3).should.be.rejectedWith(ERROR_MSG)
    })
  })
  describe('#withdraw with 2 minimum signatures', async () => {
    let multisigValidatorContract
    let twoAuthorities
    let ownerOfValidatorContract
    let foreignBridgeWithMultiSignatures
    const value = halfEther
    beforeEach(async () => {
      multisigValidatorContract = await BridgeValidators.new()
      twoAuthorities = [accounts[0], accounts[1]]
      ownerOfValidatorContract = accounts[3]
      await multisigValidatorContract.initialize(2, twoAuthorities, ownerOfValidatorContract, {
        from: ownerOfValidatorContract
      })
      foreignBridgeWithMultiSignatures = await ForeignBridge.new()
      await foreignBridgeWithMultiSignatures.initialize(
        multisigValidatorContract.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner,
        { from: ownerOfValidatorContract }
      )
      await foreignBridgeWithMultiSignatures.sendTransaction({
        from: accounts[2],
        value
      }).should.be.fulfilled
    })
    it('withdraw should fail if not enough signatures are provided', async () => {
      const recipientAccount = accounts[4]
      // msg 1
      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, value, transactionHash, foreignBridgeWithMultiSignatures.address)
      const signature = await sign(twoAuthorities[0], message)
      const vrs = signatureToVRS(signature)
      false.should.be.equal(await foreignBridgeWithMultiSignatures.relayedMessages(transactionHash))
      await foreignBridgeWithMultiSignatures
        .executeSignatures([vrs.v], [vrs.r], [vrs.s], message)
        .should.be.rejectedWith(ERROR_MSG)
      // msg 2
      const signature2 = await sign(twoAuthorities[1], message)
      const vrs2 = signatureToVRS(signature2)
      const { logs } = await foreignBridgeWithMultiSignatures.executeSignatures(
        [vrs.v, vrs2.v],
        [vrs.r, vrs2.r],
        [vrs.s, vrs2.s],
        message
      ).should.be.fulfilled

      logs[0].event.should.be.equal('RelayedMessage')
      logs[0].args.recipient.should.be.equal(recipientAccount)
      logs[0].args.value.should.be.bignumber.equal(value)
      true.should.be.equal(await foreignBridgeWithMultiSignatures.relayedMessages(transactionHash))
    })
    it('withdraw should fail if duplicate signature is provided', async () => {
      const recipientAccount = accounts[4]
      const transactionHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipientAccount, value, transactionHash, foreignBridgeWithMultiSignatures.address)
      const signature = await sign(twoAuthorities[0], message)
      const vrs = signatureToVRS(signature)
      false.should.be.equal(await foreignBridgeWithMultiSignatures.relayedMessages(transactionHash))
      await foreignBridgeWithMultiSignatures
        .executeSignatures([vrs.v, vrs.v], [vrs.r, vrs.r], [vrs.s, vrs.s], message)
        .should.be.rejectedWith(ERROR_MSG)
    })

    it('works with 5 validators and 3 required signatures', async () => {
      const recipient = accounts[8]
      const authoritiesFiveAccs = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5]]
      const ownerOfValidators = accounts[0]
      const validatorContractWith3Signatures = await BridgeValidators.new()
      await validatorContractWith3Signatures.initialize(3, authoritiesFiveAccs, ownerOfValidators)
      const value = halfEther
      const foreignBridgeWithThreeSigs = await ForeignBridge.new()

      await foreignBridgeWithThreeSigs.initialize(
        validatorContractWith3Signatures.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )
      await foreignBridgeWithThreeSigs.sendTransaction({
        from: accounts[2],
        value
      }).should.be.fulfilled

      const txHash = '0x35d3818e50234655f6aebb2a1cfbf30f59568d8a4ec72066fac5a25dbe7b8121'
      const message = createMessage(recipient, value, txHash, foreignBridgeWithThreeSigs.address)

      // signature 1
      const signature = await sign(authoritiesFiveAccs[0], message)
      const vrs = signatureToVRS(signature)

      // signature 2
      const signature2 = await sign(authoritiesFiveAccs[1], message)
      const vrs2 = signatureToVRS(signature2)

      // signature 3
      const signature3 = await sign(authoritiesFiveAccs[2], message)
      const vrs3 = signatureToVRS(signature3)

      const { logs } = await foreignBridgeWithThreeSigs.executeSignatures(
        [vrs.v, vrs2.v, vrs3.v],
        [vrs.r, vrs2.r, vrs3.r],
        [vrs.s, vrs2.s, vrs3.s],
        message
      ).should.be.fulfilled
      logs[0].event.should.be.equal('RelayedMessage')
      logs[0].args.recipient.should.be.equal(recipient)
      logs[0].args.value.should.be.bignumber.equal(value)
      true.should.be.equal(await foreignBridgeWithThreeSigs.relayedMessages(txHash))
    })
  })
  describe('#upgradeable', async () => {
    it('can be upgraded', async () => {
      const REQUIRED_NUMBER_OF_VALIDATORS = 1
      const VALIDATORS = [accounts[1]]
      const PROXY_OWNER = accounts[0]
      // Validators Contract
      let validatorsProxy = await EternalStorageProxy.new().should.be.fulfilled
      const validatorsContractImpl = await BridgeValidators.new().should.be.fulfilled
      await validatorsProxy.upgradeTo('1', validatorsContractImpl.address).should.be.fulfilled
      validatorsContractImpl.address.should.be.equal(await validatorsProxy.implementation())

      validatorsProxy = await BridgeValidators.at(validatorsProxy.address)
      await validatorsProxy.initialize(REQUIRED_NUMBER_OF_VALIDATORS, VALIDATORS, PROXY_OWNER).should.be.fulfilled

      // ForeignBridge V1 Contract

      let foreignBridgeProxy = await EternalStorageProxy.new().should.be.fulfilled
      const foreignBridgeImpl = await ForeignBridge.new().should.be.fulfilled
      await foreignBridgeProxy.upgradeTo('1', foreignBridgeImpl.address).should.be.fulfilled

      foreignBridgeProxy = await ForeignBridge.at(foreignBridgeProxy.address)
      await foreignBridgeProxy.initialize(
        validatorsProxy.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )

      // Deploy V2
      const foreignImplV2 = await ForeignBridgeV2.new()
      const foreignBridgeProxyUpgrade = await EternalStorageProxy.at(foreignBridgeProxy.address)
      await foreignBridgeProxyUpgrade.upgradeTo('2', foreignImplV2.address).should.be.fulfilled
      foreignImplV2.address.should.be.equal(await foreignBridgeProxyUpgrade.implementation())

      const foreignBridgeV2Proxy = await ForeignBridgeV2.at(foreignBridgeProxy.address)
      await foreignBridgeV2Proxy.doSomething(accounts[2], { from: accounts[4] }).should.be.rejectedWith(ERROR_MSG)
      await foreignBridgeV2Proxy.doSomething(accounts[2], { from: PROXY_OWNER }).should.be.fulfilled
      ;(await foreignBridgeV2Proxy.something()).should.be.equal(accounts[2])
    })
    it('can be deployed via upgradeToAndCall', async () => {
      const validatorsAddress = validatorContract.address

      const storageProxy = await EternalStorageProxy.new().should.be.fulfilled
      const foreignBridge = await ForeignBridge.new()
      const data = foreignBridge.contract.methods
        .initialize(
          validatorsAddress,
          dailyLimit.toString(),
          maxPerTx.toString(),
          minPerTx.toString(),
          gasPrice,
          requireBlockConfirmations,
          homeDailyLimit.toString(),
          homeMaxPerTx.toString(),
          owner
        )
        .encodeABI()
      await storageProxy.upgradeToAndCall('1', foreignBridge.address, data).should.be.fulfilled
      const finalContract = await ForeignBridge.at(storageProxy.address)
      true.should.be.equal(await finalContract.isInitialized())
      validatorsAddress.should.be.equal(await finalContract.validatorContract())
    })
  })
  describe('#claimTokens', async () => {
    it('can send erc20', async () => {
      const owner = accounts[0]
      const foreignBridgeImpl = await ForeignBridge.new()
      const storageProxy = await EternalStorageProxy.new().should.be.fulfilled
      await storageProxy.upgradeTo('1', foreignBridgeImpl.address).should.be.fulfilled
      const foreignBridge = await ForeignBridge.at(storageProxy.address)
      await foreignBridge.initialize(
        validatorContract.address,
        dailyLimit,
        maxPerTx,
        minPerTx,
        gasPrice,
        requireBlockConfirmations,
        homeDailyLimit,
        homeMaxPerTx,
        owner
      )

      const someToken = await ERC677BridgeToken.new('Roman Token', 'RST', 18)

      await someToken.mint(accounts[0], halfEther).should.be.fulfilled
      expect(await someToken.balanceOf(accounts[0])).to.be.bignumber.equal(halfEther)

      await someToken.transfer(foreignBridge.address, halfEther)
      expect(await someToken.balanceOf(accounts[0])).to.be.bignumber.equal(ZERO)
      expect(await someToken.balanceOf(foreignBridge.address)).to.be.bignumber.equal(halfEther)

      await foreignBridge
        .claimTokens(someToken.address, accounts[3], { from: accounts[3] })
        .should.be.rejectedWith(ERROR_MSG)
      await foreignBridge.claimTokens(someToken.address, accounts[3], { from: owner })
      expect(await someToken.balanceOf(foreignBridge.address)).to.be.bignumber.equal(ZERO)
      expect(await someToken.balanceOf(accounts[3])).to.be.bignumber.equal(halfEther)
    })
  })
})
