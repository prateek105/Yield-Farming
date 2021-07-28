const { expectRevert, time } = require('@openzeppelin/test-helpers')
const EnoteToken = artifacts.require('EnoteToken')

contract('EnoteToken',function([alice,bob,carol,minter]){
    beforeEach(async () => {
        this.EnoteToken = await EnoteToken.new(BigInt(10000e18),{from : alice})
        await this.EnoteToken.setMaster(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.EnoteToken.name().valueOf(), 'ERace')
        assert.equal(await this.EnoteToken.symbol().valueOf(), 'eNote')
        assert.equal(await this.EnoteToken.decimals().valueOf(), '18')
        assert.equal(await this.EnoteToken.cap().valueOf(), 10000e18)
        assert.equal(await this.EnoteToken.remPoolAmount().valueOf(), 10000e18)
    })
    
    it('should allow only owner to set master', async () => {
        await expectRevert(
            this.EnoteToken.setMaster(bob, { from: carol }),
            'Ownable: caller is not the owner'
        )
        await this.EnoteToken.setMaster(bob, { from: alice })
        assert.equal((await this.EnoteToken.eNoteMaster()).valueOf(), bob)
    })

    it('should fail, mint over token', async () => {

        await this.EnoteToken.setMaster(bob, { from: alice })
        await expectRevert(
            this.EnoteToken.mint(alice, '10000000000000000000001', { from: bob }),
            'EnoteToken: mint amount exceeds cap',
        )
    })
    it('should only allow master to mint token', async () => {
        await this.EnoteToken.mint(alice, '100', { from: minter })
        await this.EnoteToken.mint(bob, '1000', { from: minter })
        await expectRevert(
            this.EnoteToken.mint(carol, '1000', { from: bob }),
            'EnoteToken: only master farmer can mint',
        )
        const totalSupply = await this.EnoteToken.totalSupply()
        const aliceBal = await this.EnoteToken.balanceOf(alice)
        const bobBal = await this.EnoteToken.balanceOf(bob)
        const carolBal = await this.EnoteToken.balanceOf(carol)
        assert.equal(totalSupply.valueOf(), 1100)
        assert.equal(aliceBal.valueOf(), '100')
        assert.equal(bobBal.valueOf(), '1000')
        assert.equal(carolBal.valueOf(), '0')
        assert.equal(await this.EnoteToken.remPoolAmount().valueOf(), 10000e18 - 1100)
    })

    it('should supply token transfers properly', async () => {
        await this.EnoteToken.mint(alice, '500', { from: minter })
        await this.EnoteToken.transfer(carol, '200', { from: alice })
        await this.EnoteToken.transfer(bob, '100', { from: carol })
        const bobBal = await this.EnoteToken.balanceOf(bob)
        const carolBal = await this.EnoteToken.balanceOf(carol)
        assert.equal(bobBal.valueOf(), '100')
        assert.equal(carolBal.valueOf(), '100')
    })

    it('should fail if you try to do bad transfers', async () => {
        await this.EnoteToken.mint(alice, '500', { from: minter })
        await this.EnoteToken.transfer(carol, '10', { from: alice })
        await expectRevert(
            this.EnoteToken.transfer(bob, '110', { from: carol }),
            'BEP20: transfer amount exceeds balance',
        )
        await expectRevert(
            this.EnoteToken.transfer(carol, '1', { from: bob }),
            'BEP20: transfer amount exceeds balance',
        )
    })

    it("should allow burn", async () => {
        await this.EnoteToken.setMaster(minter, { from: alice })
        await this.EnoteToken.mint(bob, '500', { from: minter })

        await expectRevert(
            this.EnoteToken.burn(600, { from: bob }),
            "BEP20: burn amount exceeds balance"
        )

        await this.EnoteToken.mint(bob, '10000000000000000000', { from: minter })
        await this.EnoteToken.burn('500000000000000000', { from: bob })
        assert.equal((await this.EnoteToken.balanceOf(bob)).valueOf(), '9500000000000000500')
    })
});