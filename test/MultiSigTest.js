const { expectRevert, time } = require('@openzeppelin/test-helpers')
const { assertion } = require('@openzeppelin/test-helpers/src/expectRevert')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')
const YraceSeedMaster = artifacts.require('YraceSeedMaster')
const YraceToken = artifacts.require('YraceToken')
const Timelock = artifacts.require('Timelock')
const MultiSigWallet = artifacts.require('MultiSigWallet')
const SeedABI = require('../build/contracts/YraceSeedMaster.json')
const TimeABI = require('../build/contracts/Timelock.json')
const SigABI = require('../build/contracts/MultiSigWallet.json')



contract('MultiSigWallet', ([tokenOwner, signer1, signer2, signer3, signer4, alice,bob,carol]) => {
    beforeEach(async () => {     
        this.MultiSigWallet = await MultiSigWallet.new([signer1,signer2,signer3,signer4], 3,{ from: tokenOwner })
        this.YraceToken = await YraceToken.new({from : alice})
    })

    function getAbiFunction(contract, functionName) {
        const abi = contract.abi;
        return abi.find((abi) => abi.name === functionName);
      }
    
    
    it('should have correct settings', async () => {
        assert.equal(await this.MultiSigWallet.owners(0).valueOf(), signer1)
        assert.equal(await this.MultiSigWallet.owners(1).valueOf(), signer2)
        assert.equal(await this.MultiSigWallet.owners(2).valueOf(), signer3)
        assert.equal(await this.MultiSigWallet.owners(3).valueOf(), signer4)
        assert.equal((await this.MultiSigWallet.required()).valueOf(), 3)
        assert.equal((await this.MultiSigWallet.transactionCount()).valueOf(), 0)
    })

    it('should allow to change requirements', async () => {
        let contract = new web3.eth.Contract(SigABI.abi)
        let callData = await contract.methods.changeRequirement(2).encodeABI();
        let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
        let transactionId = tx.receipt.logs[0].args["0"];

        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3});

        assert.equal((await this.MultiSigWallet.required()).valueOf(), 2)
    })

    it('should allow only wallet to modify owners', async () => {
        await expectRevert(
            this.MultiSigWallet.addOwner(alice,{from:signer1}),
            "Call must come from wallet"
        );
        await expectRevert(
            this.MultiSigWallet.removeOwner(signer1,{from:signer2}),
            "Call must come from wallet"
        );
        await expectRevert(
            this.MultiSigWallet.replaceOwner(signer1,alice,{from:signer3}),
            "Call must come from wallet"
        );
    })

    it('should allow owners to confirm/revoke transactions', async () => {
        let contract = new web3.eth.Contract(SigABI.abi)
        let callData = await contract.methods.addOwner(alice).encodeABI();
        let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
        let transactionId = tx.receipt.logs[0].args["0"];

        await expectRevert(
            this.MultiSigWallet.revokeConfirmation(transactionId, {from: signer3}),
            "Not confirmed"
        );

        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2})
        await this.MultiSigWallet.revokeConfirmation(transactionId, {from: signer1})
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4})
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3})

        await expectRevert(
            this.MultiSigWallet.revokeConfirmation(transactionId, {from: signer2}),
            "Transaction already executed"
        );

        assert.equal(await this.MultiSigWallet.owners(0),signer1)
        assert.equal(await this.MultiSigWallet.owners(1),signer2)
        assert.equal(await this.MultiSigWallet.owners(2),signer3)
        assert.equal(await this.MultiSigWallet.owners(3),signer4)
        assert.equal(await this.MultiSigWallet.owners(4),alice)

    })

    it('should allow wallet to add/remove/replace owners', async () => {
        //add
        let contract = new web3.eth.Contract(SigABI.abi)
        let callData = await contract.methods.addOwner(alice).encodeABI();
        let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
        let transactionId = tx.receipt.logs[0].args["0"];
          
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});

        await expectRevert(
            this.MultiSigWallet.confirmTransaction(transactionId, {from: bob}),
            "Owner does not exist"
        );
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4})

        //remove
        callData = await contract.methods.removeOwner(signer2).encodeABI();
        tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
        transactionId = tx.receipt.logs[0].args["0"];
          
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});

        //replace
        callData = await contract.methods.replaceOwner(signer1,bob).encodeABI();
        tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
        transactionId = tx.receipt.logs[0].args["0"];
          
        await expectRevert(
            this.MultiSigWallet.revokeConfirmation(transactionId, {from: signer3}),
            "Not confirmed"
        );
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});
        await this.MultiSigWallet.confirmTransaction(transactionId, {from: alice});

        assert.equal(await this.MultiSigWallet.owners(0),bob)
        assert.equal(await this.MultiSigWallet.owners(1),alice)
        assert.equal(await this.MultiSigWallet.owners(2),signer3)
        assert.equal(await this.MultiSigWallet.owners(3),signer4)
    })

    context('Working with timelock', () => {
        beforeEach(async () => {
            this.pool1 = "0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867"
            this.pool2 = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
            this.pool3 = "0x9780881Bf45B83Ee028c4c1De7e0C168dF8e9eEF"

            this.TLcontract = new web3.eth.Contract(TimeABI.abi) //time lock
        })

        it('should allow to add/modify pools using timelock', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 100,200, tokenOwner, { from: tokenOwner })
            this.timelock = await Timelock.new(this.MultiSigWallet.address, 21600,{ from: tokenOwner })
            await this.master.transferOwnership(this.timelock.address,{from: tokenOwner})

            //add pools
            let data = web3.eth.abi.encodeParameters(['uint256','address','uint256','bool'],['100', this.pool1 ,500, true]);
            let signature = "add(uint256,address,uint16,bool)"
            let eta = await time.latest()/1 + 22000

            let callData = await this.TLcontract.methods.queueTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            let tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            let transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3})

            await time.increase(25000)

            callData = await this.TLcontract.methods.executeTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];
            
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});

            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.pool1)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '500')

            //modify pools
            data = web3.eth.abi.encodeParameters(['uint256','uint256','uint16','bool'],[0,200,1000,true]);
            signature = "set(uint256,uint256,uint16,bool)"
            eta = await time.latest()/1 + 22000

            callData = await this.TLcontract.methods.queueTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3})

            await time.increase(25000)

            callData = await this.TLcontract.methods.executeTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];
            
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});

            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.pool1)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '200')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '1000')
        })

        it('should allow explicit execute if required == no. of owners', async () => {
            let contract = new web3.eth.Contract(SigABI.abi)
            let callData = await contract.methods.addOwner(alice).encodeABI();
            let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            let transactionId1 = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId1, {from: signer2});
    
            //remove owners
            callData = await contract.methods.removeOwner(signer4).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            let transactionId2 = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId2, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId2, {from: signer3});

            callData = await contract.methods.removeOwner(signer3).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            let transactionId3 = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId3, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId3, {from: signer3});
    
            //execute explicitly
            await this.MultiSigWallet.executeTransaction(transactionId1, {from: signer1});

    
            assert.equal(await this.MultiSigWallet.owners(0),signer1)
            assert.equal(await this.MultiSigWallet.owners(1),signer2)
            assert.equal(await this.MultiSigWallet.owners(2),alice)
        })

        it('should give proper confirmations list', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 100,200, tokenOwner, { from: tokenOwner })
            this.timelock = await Timelock.new(this.MultiSigWallet.address, 21600,{ from: tokenOwner })
            await this.master.transferOwnership(this.timelock.address,{from: tokenOwner})

            let data = web3.eth.abi.encodeParameters(['uint256','address','uint256','bool'],['100', this.pool1 ,500, true]);
            let signature = "add(uint256,address,uint16,bool)"
            let eta = await time.latest()/1 + 22000

            let callData = await this.TLcontract.methods.queueTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            let tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            let transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3})

            let confirmations = await this.MultiSigWallet.getConfirmations(transactionId, {from: bob});

            assert.equal(confirmations[0], signer1)
            assert.equal(confirmations[1], signer2)
            assert.equal(confirmations[2], signer3)

            await time.increase(25000)

            callData = await this.TLcontract.methods.executeTransaction(this.master.address, 0,signature,data,eta).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.timelock.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];
            
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});

            confirmations = await this.MultiSigWallet.getConfirmations(transactionId, {from: bob});

            assert.equal(confirmations[0], signer1)
            assert.equal(confirmations[1], signer2)
            assert.equal(confirmations[2], signer4)
        })

        it('should give proper transactions list', async () => {
            let contract = new web3.eth.Contract(SigABI.abi)
            let callData = await contract.methods.addOwner(alice).encodeABI();
            let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            let transactionId = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4})

            callData = await contract.methods.removeOwner(signer2).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});

            callData = await contract.methods.replaceOwner(signer1,bob).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer4});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: alice});

            //pending-true | executed- true
            let transactions = await this.MultiSigWallet.getTransactionIds(0,3,true,true, {from: bob}); //all txns
            assert.equal(transactions[0],0)
            assert.equal(transactions[1],1)
            assert.equal(transactions[2],2) //?
            //pending-true | executed- false
            transactions = await this.MultiSigWallet.getTransactionIds(0,3,true,false, {from: bob}); //pending txns only
            assert.equal(transactions[0],1)
            //pending-false | executed- true
            transactions = await this.MultiSigWallet.getTransactionIds(0,3,false,true, {from: bob}); //executed txns only
            assert.equal(transactions[0],0)
            assert.equal(transactions[1],2)
        })

        it.only('should allow deposit and withdraw of tokens / native coin', async () => {

            await this.YraceToken.setMaster(alice, {from : alice})
            await this.YraceToken.mint(this.MultiSigWallet.address,"10000", {from : alice})
            await web3.eth.sendTransaction({to: this.MultiSigWallet.address, from : signer1, value : web3.utils.toWei("1", "ether")});

            //withdraw native coins
            let contract = new web3.eth.Contract(SigABI.abi)
            let callData = await contract.methods.withdrawNative(signer1,BigInt(250000000000000000)).encodeABI();
            let tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            let transactionId = tx.receipt.logs[0].args["0"];
              
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3});

            assert.equal(await web3.eth.getBalance(this.MultiSigWallet.address)/1,750000000000000000)

            //withdraw by non-owner
            callData = await contract.methods.withdrawNative(alice,BigInt(10000000000000000000)).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await expectRevert(
                this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3}),
                "low level call failed"
            ) 

            //withdraw huge amount by owner
            callData = await contract.methods.withdrawNative(signer1,BigInt(10000000000000000000)).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3});

            assert.equal(await web3.eth.getBalance(this.MultiSigWallet.address),0)

            //withdraw BEP20 token by owner
            callData = await contract.methods.withdrawToken(this.YraceToken.address,signer1,1000).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer1});
            transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer3});

            assert.equal(await this.YraceToken.balanceOf(this.MultiSigWallet.address),9000)
            assert.equal(await this.YraceToken.balanceOf(signer1),1000)

            callData = await contract.methods.withdrawToken(this.YraceToken.address,signer3,5000).encodeABI();
            tx = await this.MultiSigWallet.submitTransaction(this.MultiSigWallet.address, 0,callData, {from: signer3});
            transactionId = tx.receipt.logs[0].args["0"];

            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer2});
            await this.MultiSigWallet.confirmTransaction(transactionId, {from: signer1});

            assert.equal(await this.YraceToken.balanceOf(this.MultiSigWallet.address),4000)
            assert.equal(await this.YraceToken.balanceOf(signer3),5000)

            
        })
    })
})
