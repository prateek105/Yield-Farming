const { expectRevert, time, constants,BN } = require('@openzeppelin/test-helpers')
const { assertion } = require('@openzeppelin/test-helpers/src/expectRevert')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')
const YraceToken = artifacts.require('YraceToken')
const YraceSeedMaster = artifacts.require('YraceSeedMaster')
const MockBEP20 = artifacts.require('MockBEP20')
const Timelock = artifacts.require('Timelock')
const SeedABI = require('../build/contracts/YraceSeedMaster.json')
const TimeABI = require('../build/contracts/Timelock.json')


contract('Timelock', ([alice, bob, carol, dev, eliah, minter, feeAddress,admin]) => {
    beforeEach(async () => {
        this.timelock = await Timelock.new(admin, 21600,{ from: alice })
        this.YraceToken = await YraceToken.new({from : alice})
    })

    it('should have correct settings', async ()=>{
        assert.equal((await this.timelock.GRACE_PERIOD()).valueOf(), 14*24*60*60)
        assert.equal((await this.timelock.MINIMUM_DELAY()).valueOf(), 21600)
        assert.equal((await this.timelock.MAXIMUM_DELAY()).valueOf(), 30*24*60*60)
        assert.equal((await this.timelock.admin()).valueOf(), admin)
        assert.equal((await this.timelock.delay()).valueOf(), 21600)
    })

    context('With master contract deployed', () => {
        beforeEach(async () => {
            this.lp = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
            await this.lp.transfer(alice, '1000', { from: minter })
            await this.lp.transfer(bob, '1000', { from: minter })
            await this.lp.transfer(carol, '1000', { from: minter })
            await this.lp.transfer(dev, '1000', { from: minter })
            await this.lp.transfer(eliah, '1000', { from: minter })
            this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })
            await this.lp2.transfer(alice, '1000', { from: minter })
            await this.lp2.transfer(bob, '1000', { from: minter })
            await this.lp2.transfer(carol, '1000', { from: minter })
            await this.lp2.transfer(dev, '1000', { from: minter })
            await this.lp2.transfer(eliah, '1000', { from: minter })
        })

        it('should allow to change delay',async ()=>{
            // runs
            // const contract = new web3.eth.Contract(TimeABI.abi);
            // const data = await contract.methods.setDelay(25000).encodeABI();
            // const signature = web3.eth.sign(data,admin)
            // const eta = await time.latest()/1 + 21600
            const data = web3.eth.abi.encodeParameters(['uint256'],['25000']);
            const signature = "setDelay(uint256)"
            const eta = await time.latest()/1 + 21600

            await this.timelock.queueTransaction(
                this.timelock.address, 0,signature,data,eta, {from : admin})
            
            await time.increase(25000);

            await this.timelock.executeTransaction(
                this.timelock.address, 0,signature,data,eta, {from : admin})

            assert.equal((await this.timelock.delay()).valueOf(), 25000)

        })

        it('should allow to change admin once',async ()=>{

            await expectRevert(
                this.timelock.setPendingAdmin(alice,{from:alice}),
                "Timelock::setPendingAdmin: First call must come from admin."
            )
            this.timelock.setPendingAdmin(alice,{from:admin});

            await expectRevert(
                this.timelock.acceptAdmin({from:bob}),
                "Timelock::acceptAdmin: Call must come from pendingAdmin."
            )
            await this.timelock.acceptAdmin({from:alice}),

            assert.equal((await this.timelock.admin()).valueOf(), alice)

        })

        it('should allow to queue and execute txns', async ()=>{
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 100,200, feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true, { from: alice})

            await this.master.transferOwnership(this.timelock.address,{from:alice})

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: dev })


            const contract = new web3.eth.Contract(SeedABI.abi);

            await time.advanceBlockTo(110);

            const data = web3.eth.abi.encodeParameters(['uint256','address','uint256','bool'],['200', this.lp2.address,500, true]);
            const signature = "add(uint256,address,uint16,bool)"
            const eta = await time.latest()/1 + 25000
            const cbt = await time.latest()/1 //current block time

            await expectRevert(
                this.timelock.queueTransaction(
                    this.master.address, 0,signature,data,eta, {from : alice}),
                "Timelock::queueTransaction: Call must come from admin."
            ) 

            await expectRevert(
                this.timelock.queueTransaction(
                    this.master.address, 0,signature,data,cbt, {from : admin}),
                "Timelock::queueTransaction: Estimated execution block must satisfy delay."
            ) 

            await this.timelock.queueTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta+1, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't been queued."
            ) 

            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't surpassed time lock."
            )   

            await time.increase(10*60*60)

            await this.timelock.executeTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            const callData2 = web3.eth.abi.encodeParameters(['uint256','uint256','uint16','bool'],[0,200,500,true]);
            const signature2 = "set(uint256,uint256,uint16,bool)"
            const eta2 = await time.latest()/1 + 25000

            await this.timelock.queueTransaction(
                this.master.address, 0,signature2,callData2,eta2, {from : admin})

            await time.increase(25000)

            await this.timelock.executeTransaction(
                this.master.address, 0,signature2,callData2,eta2, {from : admin})


            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '200')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '500')
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '200')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '500')
        }) 

        it('should allow cancel txns', async ()=>{
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 150,250, feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true, { from: alice})
            await this.master.add('100', this.lp2.address,1000, true, { from: alice})

            await this.master.transferOwnership(this.timelock.address,{from:alice})

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: dev })

            // console.log(await web3.eth.currentProvider)

            const contract = new web3.eth.Contract(SeedABI.abi);

            await time.advanceBlockTo(170);

            const data = web3.eth.abi.encodeParameters(['uint256','uint256','uint16','bool'],[0,200,0,true]);
            const signature = "set(uint256,uint256,uint16,bool)"
            const eta = await time.latest()/1 + 25000

            await this.timelock.queueTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})
            
            await time.increase(1*60*60);

            await this.timelock.cancelTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            await expectRevert(
                this.timelock.executeTransaction(
                    this.master.address, 0,signature,data,eta, {from : admin}),
                "Timelock::executeTransaction: Transaction hasn't been queued."
            ) 

            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '1000')
        }) 

        it('should allow setup of farming', async ()=>{
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 200,300, feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true, { from: alice})
            await this.master.add('100', this.lp2.address,1000, true, { from: alice})

            await this.master.transferOwnership(this.timelock.address,{from:alice})

            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: dev })

            await time.advanceBlockTo(249)
            await this.master.deposit(0,100,constants.ZERO_ADDRESS,{from:bob})
            await this.master.deposit(1,100,constants.ZERO_ADDRESS,{from:carol})

            const contract = new web3.eth.Contract(SeedABI.abi);

            await time.advanceBlockTo(270);

            const data = '0x0'
            const signature = "massUpdatePools()"
            const eta = await time.latest()/1 + 25000

            await this.timelock.queueTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})
            
            await time.advanceBlockTo(300)
            await time.increase(25000);

            await this.timelock.executeTransaction(
                this.master.address, 0,signature,data,eta, {from : admin})

            await this.YraceToken.setMaster(minter, { from: alice })
    
            await this.master.harvest(0, { from: bob })
            await this.master.harvest(1, { from: carol })

            assert.equal(await this.YraceToken.balanceOf(bob),'249');
            assert.equal(await this.YraceToken.balanceOf(carol),'244');           


        }) 
    })
})