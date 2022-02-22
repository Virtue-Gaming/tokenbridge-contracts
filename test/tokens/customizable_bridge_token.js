const CustomizableERC677BridgeToken = artifacts.require('CustomizableERC677BridgeToken.sol')
const { assert } = require('chai')

require('../setup')

contract('CustomizableERC677BridgeToken', async accounts => {
  let token = null

  beforeEach(async () => {
    token = await CustomizableERC677BridgeToken.new('Initial value', 'IVT', 27)
  })

  it('owner should be able to update details', async () => {
    assert.equal('Initial value', await token.name())
    assert.equal('IVT', await token.symbol())
    assert.equal(27, await token.decimals())

    const { logs } = await token.updateDetails('Another name', 'ANT', 18, { from: accounts[0] }).should.be.fulfilled

    assert.equal('Another name', await token.name())
    assert.equal('ANT', await token.symbol())
    assert.equal(18, await token.decimals())

    const [detailsUpdatedEvent] = logs
    detailsUpdatedEvent.args.name.should.be.equal('Another name')
    detailsUpdatedEvent.args.symbol.should.be.equal('ANT')
    detailsUpdatedEvent.args.decimals.should.be.bignumber.equal('18')
  })

  it('non owner should not be able to update details', async () => {
    await token.updateDetails('Another name', 'ANT', 18, { from: accounts[1] }).should.be.rejected

    assert.equal('Initial value', await token.name())
    assert.equal('IVT', await token.symbol())
    assert.equal(27, await token.decimals())
  })
})
