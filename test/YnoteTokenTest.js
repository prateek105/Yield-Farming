const { expectRevert, time } = require('@openzeppelin/test-helpers')
const YnoteToken = artifacts.require('YnoteToken')

contract('YnoteToken',function([alice,bob,carol,minter,presale]){
    beforeEach(async () => {
        this.YnoteToken = await YnoteToken.new({from : alice})
        await this.YnoteToken.setMaster(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.YnoteToken.name().valueOf(), 'Ynote')
        assert.equal(await this.YnoteToken.symbol().valueOf(), 'Ynote')
        assert.equal(await this.YnoteToken.decimals().valueOf(), '18')
    })
    
    it('should allow only owner to set master', async () => {
        await expectRevert(
            this.YnoteToken.setMaster(bob, { from: carol }),
            'Ownable: caller is not the owner'
        )
        await this.YnoteToken.setMaster(bob, { from: alice })
        assert.equal((await this.YnoteToken.yNoteMaster()).valueOf(), bob)
    })

    it('should only allow master to mint token', async () => {
        await this.YnoteToken.mint(alice, '100', { from: minter })
        await this.YnoteToken.mint(bob, '1000', { from: minter })
        await expectRevert(
            this.YnoteToken.mint(carol, '1000', { from: bob }),
            'YnoteToken: only master farmer can mint',
        )
        const totalSupply = await this.YnoteToken.totalSupply()
        const aliceBal = await this.YnoteToken.balanceOf(alice)
        const bobBal = await this.YnoteToken.balanceOf(bob)
        const carolBal = await this.YnoteToken.balanceOf(carol)
        assert.equal(totalSupply.valueOf(), 1100)
        assert.equal(aliceBal.valueOf(), '100')
        assert.equal(bobBal.valueOf(), '1000')
        assert.equal(carolBal.valueOf(), '0')
    })

    it('should supply token transfers properly', async () => {
        await this.YnoteToken.mint(alice, '500', { from: minter })
        await this.YnoteToken.transfer(carol, '200', { from: alice })
        await this.YnoteToken.transfer(bob, '100', { from: carol })
        const bobBal = await this.YnoteToken.balanceOf(bob)
        const carolBal = await this.YnoteToken.balanceOf(carol)
        assert.equal(bobBal.valueOf(), '100')
        assert.equal(carolBal.valueOf(), '100')
    })

    it('should fail if you try to do bad transfers', async () => {
        await this.YnoteToken.mint(alice, '500', { from: minter })
        await this.YnoteToken.transfer(carol, '10', { from: alice })
        await expectRevert(
            this.YnoteToken.transfer(bob, '110', { from: carol }),
            'BEP20: transfer amount exceeds balance',
        )
        await expectRevert(
            this.YnoteToken.transfer(carol, '1', { from: bob }),
            'BEP20: transfer amount exceeds balance',
        )
    })
});