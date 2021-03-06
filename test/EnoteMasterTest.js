const { expectRevert, time, constants } = require('@openzeppelin/test-helpers')
const EnoteToken = artifacts.require('EnoteToken')
const EnoteMaster = artifacts.require('EnoteMaster')
const YnoteToken = artifacts.require('YnoteToken')
const YnoteSeedMaster = artifacts.require('YnoteSeedMaster')
const YnoteLPMaster = artifacts.require('YnoteLPMaster')
const MockBEP20 = artifacts.require('MockBEP20')

contract('EnoteMaster', ([alice, bob, carol, dev, eliah, minter,feeAddress]) => {
    beforeEach(async () => {
        this.EnoteToken = await EnoteToken.new(1000,{ from: alice })
        this.YnoteToken = await YnoteToken.new({ from: alice })  
        await this.YnoteToken.setMaster(minter, { from: alice })      
    })

    it('should set correct state variables', async () => {
        this.master = await EnoteMaster.new(this.EnoteToken.address, 100, 100,500,this.YnoteToken.address, { from: alice })
        await this.EnoteToken.setMaster(this.master.address, { from: alice })
        
        const Enote = await this.master.eNote()
        assert.equal(Enote.valueOf(), this.EnoteToken.address)

        assert.equal((await this.master.REWARD_PER_BLOCK()).valueOf(), 100)
        assert.equal((await this.master.START_BLOCK()).valueOf(), 100)
        assert.equal((await this.master.END_BLOCK()).valueOf(), 500)
    })

    it('should allow only master farmer can mint', async () => {
        this.master = await EnoteMaster.new(this.EnoteToken.address, 50, 100,500,this.YnoteToken.address,{ from: alice })
        await this.EnoteToken.setMaster(minter, { from: alice })

        assert.equal((await this.EnoteToken.eNoteMaster()).valueOf(), minter)
        await expectRevert(
            this.EnoteToken.mint(alice, '1000', { from: alice }),
            "only master farmer can mint"
        )

        await expectRevert(
            this.EnoteToken.mint(alice, '10001', { from: minter }),
            "EnoteToken: mint amount exceeds cap"
        )

        await this.EnoteToken.mint(alice, '100', { from: minter })
        assert.equal((await this.EnoteToken.balanceOf(alice)).valueOf(), "100")

    })

    context('With YnoteToken token added to the field', () => {
        beforeEach(async () => {
            await this.YnoteToken.mint(alice, '1000', { from: minter })
            await this.YnoteToken.mint(bob, '1000', { from: minter })
            await this.YnoteToken.mint(carol, '1000', { from: minter })
            await this.YnoteToken.mint(dev, '1000', { from: minter })
            await this.YnoteToken.mint(eliah, '1000', { from: minter })
        })

        it('should correctly add pool', async () => {
            // 100 per block, start at block 100
            this.master = await EnoteMaster.new(this.EnoteToken.address, 100, 100,500,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })

            assert.equal((await this.master.YnotePool()).lpToken.valueOf(), this.YnoteToken.address)
            assert.equal((await this.master.YnotePool()).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.YnotePool()).rewardPerShare.valueOf(), '0')
        })

        it('should correct deposit', async () => {
           this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 100,200,this.YnoteToken.address, { from: alice })
           await this.EnoteToken.setMaster(this.master.address, { from: alice })

            await this.YnoteToken.approve(this.master.address, '1000', { from: bob }) 
            await this.YnoteToken.approve(this.master.address, '1000', { from: carol })

            await expectRevert(
                   this.master.deposit(100, { from: bob }),
                   "EnoteMaster: Staking period has not started"
            )

            await time.advanceBlockTo(110);

            await this.master.deposit(100, { from: bob })
            assert.equal((await this.YnoteToken.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.YnoteToken.balanceOf(this.master.address)).valueOf(), '100')
            assert.equal((await this.master.userInfo(bob)).amount.valueOf(),'100')
            assert.equal((await this.master.pendingReward(bob)).valueOf(), "0")
            assert.equal((await this.master.userInfo(bob)).rewardDebt.valueOf(), "0")
            assert.equal((await this.master.YnotePool()).rewardPerShare.valueOf(), "0")

            await this.master.deposit(50,{ from: carol })
            assert.equal((await this.YnoteToken.balanceOf(carol)).valueOf(), '950')
            assert.equal((await this.YnoteToken.balanceOf(this.master.address)).valueOf(), '150')
        })

        it('should give out EnoteToken only after end of staking period', async () => {
            // 10 per block farming rate starting at block 200 
            this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 200,300,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })

            await time.advanceBlockTo('190')
            await this.EnoteToken.transferOwnership(this.master.address, { from: alice })

            await this.YnoteToken.approve(this.master.address, '1000', { from: bob }) 
            await this.YnoteToken.approve(this.master.address, '1000', { from: carol }) 

            await time.advanceBlockTo('199')            
            await this.master.deposit(100,{ from: bob }) // 200
            await this.master.deposit(10,{ from: carol })
            await time.advanceBlockTo('250')

            await expectRevert(
                this.master.harvest({ from: bob }), 
                "EnoteMaster: Staking period is in progress"
            )
            assert.equal((await this.EnoteToken.balanceOf(bob)).valueOf(), '0')
            
            await time.advanceBlockTo('300')
            
            await this.master.withdraw(5, { from: bob })
            await this.master.withdraw(5, { from: bob })

            await this.master.harvest({ from: bob })
            await this.master.harvest({ from: carol })

            await expectRevert(
                this.master.withdraw(5, { from: bob }), 
                "EnoteMaster: No tokens staked"
            )
            await expectRevert(
                this.master.harvest({ from: bob }), 
                "EnoteMaster: No rewards to claim"
            )
            await expectRevert(
                this.master.deposit(100,{ from: bob }),
                "EnoteMaster: Staking period has ended"
            )
            assert.equal((await this.EnoteToken.balanceOf(bob)).valueOf(), '910')
            assert.equal((await this.YnoteToken.balanceOf(bob)).valueOf(), '1000')
            assert.equal((await this.EnoteToken.balanceOf(carol)).valueOf(), '90')
            assert.equal((await this.YnoteToken.balanceOf(carol)).valueOf(), '1000')
        })

        it('should not distribute EnoteToken if no one deposit', async () => {
            // 10 per block farming rate starting at block 400 
            this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 400,500,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })

            await this.EnoteToken.transferOwnership(this.master.address, { from: alice })
            await this.YnoteToken.approve(this.master.address, '1000', { from: bob })
            await time.advanceBlockTo('430')
            assert.equal((await this.EnoteToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('440')
            assert.equal((await this.EnoteToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('450')
            await this.master.updatePool() 
            assert.equal((await this.EnoteToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.EnoteToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.EnoteToken.balanceOf(dev)).valueOf(), '0')
            await time.advanceBlockTo('459')
            await this.master.deposit( '10',{ from: bob }) 
            assert.equal((await this.YnoteToken.balanceOf(this.master.address)).valueOf(), '10')
            assert.equal((await this.EnoteToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.EnoteToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.EnoteToken.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.YnoteToken.balanceOf(bob)).valueOf(), '990')

            await time.advanceBlockTo('500')
            await this.master.withdraw(5, { from: bob })
            await this.master.harvest({ from: bob })
            
            assert.equal(await this.EnoteToken.balanceOf(bob).valueOf(),'400')
            assert.equal(await this.YnoteToken.balanceOf(bob).valueOf(),'1000')
        })

        it('should equally distribute', async () => {
           this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 600,700,this.YnoteToken.address, { from: alice })
           await this.EnoteToken.setMaster(this.master.address, { from: alice })

            await this.YnoteToken.approve(this.master.address, '1000', { from: alice })
            await this.YnoteToken.approve(this.master.address, '1000', { from: bob })
            await this.YnoteToken.approve(this.master.address, '1000', { from: carol })
            await this.YnoteToken.approve(this.master.address, '1000', { from: dev })

            // console.log(await time.latestBlock());
            await time.advanceBlockTo('599')
            await this.master.deposit(100,{ from: alice })
            await this.master.deposit(100,{ from: bob })
            await this.master.deposit(100,{ from: carol })
            await this.master.deposit(100,{ from: dev })

          // ----- claiming anytime after sale end (equal distribution)

            await time.advanceBlockTo('710')

            await this.master.harvest({ from: alice })
            assert.equal(await this.EnoteToken.balanceOf(alice),'260');

            await this.master.harvest({ from: bob })
            assert.equal(await this.EnoteToken.balanceOf(bob),'250');

            await this.master.harvest({ from: carol })
            assert.equal(await this.EnoteToken.balanceOf(carol),'245');

            await this.master.harvest({ from: dev })
            assert.equal(await this.EnoteToken.balanceOf(dev),'242');
         

            await expectRevert(
                this.master.withdraw(5, { from: alice }),
                "EnoteMaster: No tokens staked"
            );
        })

        it('should properly distribute at different deposit amounts', async () => {
            this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 800,900,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })
 
             await this.YnoteToken.approve(this.master.address, '1000', { from: alice })
             await this.YnoteToken.approve(this.master.address, '1000', { from: bob })
             await this.YnoteToken.approve(this.master.address, '1000', { from: carol })
             await this.YnoteToken.approve(this.master.address, '1000', { from: dev })

             await time.advanceBlockTo('799')
             await this.master.deposit(100,{ from: alice })
             await this.master.deposit(200,{ from: bob })
             await this.master.deposit(300,{ from: carol })
             await this.master.deposit(400,{ from: dev })
 
           // ----- claiming anytime after sale end (equal distribution)

             await time.advanceBlockTo('910')
 
             await this.master.harvest( { from: alice })
             assert.equal(await this.EnoteToken.balanceOf(alice),'111');
             await this.master.harvest({ from: bob })
             assert.equal(await this.EnoteToken.balanceOf(bob),'203');
             await this.master.harvest({ from: carol })
             assert.equal(await this.EnoteToken.balanceOf(carol),'296');
             await this.master.harvest({ from: dev })
             assert.equal(await this.EnoteToken.balanceOf(dev),'388');

         })

        it('should distribute properly when multiple deposit', async () => {
            this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 1000,1100,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })
 
             await this.YnoteToken.approve(this.master.address, '1000', { from: alice })
             await this.YnoteToken.approve(this.master.address, '1000', { from: bob })
             await this.YnoteToken.approve(this.master.address, '1000', { from: carol })
             await this.YnoteToken.approve(this.master.address, '1000', { from: eliah })
 
             await time.advanceBlockTo('999')
             await this.master.deposit(100,{ from: alice }) 
             await this.master.deposit(100,{ from: bob })
             await time.advanceBlockTo('1050')
             await this.master.deposit(100,{ from: alice })

            // ----- claiming anytime after sale end (equal distribution)
             await time.advanceBlockTo('1100')
             await this.master.harvest({ from: alice })
             assert.equal(await this.EnoteToken.balanceOf(alice),'586');
 
             await this.master.harvest({ from: bob })
             assert.equal(await this.EnoteToken.balanceOf(bob),'413');         
        })

        it('should allow partial withdraw but not give Enote token', async () => {
            this.master = await EnoteMaster.new(this.EnoteToken.address, 10, 1200,1300,this.YnoteToken.address, { from: alice })
            await this.EnoteToken.setMaster(this.master.address, { from: alice })
 
             await this.YnoteToken.approve(this.master.address, '1000', { from: alice })
             await this.YnoteToken.approve(this.master.address, '1000', { from: bob })
             await this.YnoteToken.approve(this.master.address, '1000', { from: carol })
             await this.YnoteToken.approve(this.master.address, '1000', { from: dev })
 

             await time.advanceBlockTo('1199')
             await this.master.deposit(100,{ from: alice })
             await this.master.deposit(100,{ from: bob })

             await time.advanceBlockTo('1249')
             await this.master.deposit(100,{ from: alice })
             await this.master.withdraw(50, { from: bob })
             assert.equal(await this.EnoteToken.balanceOf(bob),'0');

             await time.advanceBlockTo('1274')
             await this.master.deposit(50,{ from: bob }) 
             await this.master.withdraw(200, { from: alice })


            // ----- claiming anytime after sale end (equal distribution)
             await time.advanceBlockTo('1310')

             await this.master.harvest({ from: alice })
             assert.equal(await this.EnoteToken.balanceOf(alice),'460');
 
             await this.master.harvest({ from: bob })
             assert.equal(await this.EnoteToken.balanceOf(bob),'539');       
        })

        it('should be live after seed pool phase', async () => {
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

            this.master = await YnoteSeedMaster.new(this.YnoteToken.address, 10, 1400,1500,feeAddress, { from: alice })
            await this.YnoteToken.setMaster(this.master.address, { from: alice })
 
            await this.master.add('100', this.lp.address,1000, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.lp.approve(this.master.address, '1000', { from: eliah })
            await this.lp.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address,1000, true)
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: eliah })
            await this.lp2.approve(this.master.address, '1000', { from: dev })
            
             await time.advanceBlockTo('1399')
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) 
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
             await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: carol }) 
             await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: dev })

             await time.advanceBlockTo('1450')
             await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice })
             await this.master.withdraw(1, 45, { from: carol })
             assert.equal(await this.YnoteToken.balanceOf(carol),'1000');

             await time.advanceBlockTo('1474')
             await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: carol }) 

            
             this.master2 = await YnoteLPMaster.new(this.YnoteToken.address, 10, 1500,100,feeAddress, { from: alice })

             this.master3 = await EnoteMaster.new(this.EnoteToken.address, 10, 1500,1600,this.YnoteToken.address, { from: alice })
             await this.EnoteToken.setMaster(this.master3.address, { from: alice })
 
             await this.master2.add('100', this.lp.address,1000, true) // for LP
             await this.lp.approve(this.master2.address, '1000', { from: alice })
             await this.lp.approve(this.master2.address, '1000', { from: bob })
             await this.lp.approve(this.master2.address, '1000', { from: carol })
             await this.lp.approve(this.master2.address, '1000', { from: dev })
 
             await this.master2.add('100', this.lp2.address,500, true) // for LP
             await this.lp2.approve(this.master2.address, '1000', { from: eliah })

             await this.YnoteToken.approve(this.master3.address, '1000', { from: alice })
             await this.YnoteToken.approve(this.master3.address, '1000', { from: bob })
             await this.YnoteToken.approve(this.master3.address, '1000', { from: carol })
             await this.YnoteToken.approve(this.master3.address, '1000', { from: dev })

             await time.advanceBlockTo('1500')
             await this.master.massUpdatePools();
             await this.YnoteToken.setMaster(this.master2.address, { from: alice })


             await this.master.harvest(0, { from: alice })
             assert.equal(await this.YnoteToken.balanceOf(alice),'1293');
 
             await this.master.harvest(0, { from: bob })
             assert.equal(await this.YnoteToken.balanceOf(bob),'1207');    

       
             await this.master2.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })  
             await this.master2.deposit(0, 20,constants.ZERO_ADDRESS, { from: bob })    
             await this.master2.deposit(0, 30,constants.ZERO_ADDRESS, { from: carol })  
             await this.master2.deposit(0, 40,constants.ZERO_ADDRESS, { from: dev })    
             await this.master2.deposit(1, 10,constants.ZERO_ADDRESS, { from: eliah })  

             await this.master3.deposit(100,{ from: alice })
             await this.master3.deposit(200,{ from: bob })
             await this.master3.deposit(300,{ from: carol })
             await this.master3.deposit(400,{ from: dev })
 
             await this.master.harvest(1, { from: carol })
             assert.equal(await this.YnoteToken.balanceOf(carol),'941');
 
             await this.master.harvest(1, { from: dev })
             assert.equal(await this.YnoteToken.balanceOf(dev),'849');     
             
             await time.advanceBlockTo('1549')
 
             await this.master2.withdraw(0,9, { from: alice })            
             assert.equal(await this.YnoteToken.balanceOf(alice),'1477');

             await this.master2.withdraw(0,18, { from: bob })           
             assert.equal(await this.YnoteToken.balanceOf(bob),'1489');

             await this.master2.withdraw(0,27, { from: carol })        
             assert.equal(await this.YnoteToken.balanceOf(carol),'1635');

            await this.master2.withdraw(0,36, { from: dev })             
            assert.equal(await this.YnoteToken.balanceOf(dev),'1789');
            
            await this.master2.withdraw(1,9, { from: eliah })           
            assert.equal(await this.YnoteToken.balanceOf(eliah),'3250');

             
            await time.advanceBlockTo('1610')

            await this.master3.harvest( { from: alice })
            assert.equal(await this.EnoteToken.balanceOf(alice),'101');

            await this.master3.harvest({ from: bob })
            assert.equal(await this.EnoteToken.balanceOf(bob),'183');

            await this.master3.harvest({ from: carol })
            assert.equal(await this.EnoteToken.balanceOf(carol),'266');

            await this.master3.harvest({ from: dev })
            assert.equal(await this.EnoteToken.balanceOf(dev),'348');
 
         })
    })
})
