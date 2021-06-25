const Web3 = require("web3");
const {TESTNET_RPC_URL,TL_ADDRESS,SEED_ADDRESS,LP_ADDRESS} = require("../config.js");
const TimeABI = require('../build/contracts/Timelock.json');
const SigABI = require('../build/contracts/MultiSigWallet.json');

let web3;
let TimeLock;
let MultiSig;

class Setup {
	constructor() {
		web3 = new Web3(TESTNET_RPC_URL);
    TimeLock = new web3.eth.Contract(TimeABI.abi)
    MultiSig = new web3.eth.Contract(SigABI.abi)
	}

    callDataForModify(operType,target,funcName, params,eta) {
      let signature;
      let data;
      let callData;

      if (funcName == "add") {
        signature = "add(uint256,address,uint16,bool)";
        data = web3.eth.abi.encodeParameters(["uint256", "address", "uint256", "bool"], params);
      }
      if (funcName == "set") {
        data = web3.eth.abi.encodeParameters(["uint256", "uint256", "uint16", "bool"], params);
        signature = "set(uint256,uint256,uint16,bool)";
      }
      if(funcName == "updateReferralBonusBp"){
        data = web3.eth.abi.encodeParameters(["uint256"], params);
        signature = "updateReferralBonusBp(uint256)";
      }

      if(target=="Seed"){
        if(operType == "queue")
          callData = TimeLock.methods.queueTransaction(SEED_ADDRESS, 0,signature,data,eta).encodeABI()
        if(operType == "execute")
          callData = TimeLock.methods.executeTransaction(SEED_ADDRESS, 0,signature,data,eta).encodeABI()
      }
      
      if(target=="LP"){
        if(operType == "queue")
          callData = TimeLock.methods.queueTransaction(LP_ADDRESS, 0,signature,data,eta).encodeABI()
        if(operType == "execute")
          callData = TimeLock.methods.executeTransaction(LP_ADDRESS, 0,signature,data,eta).encodeABI()
      }
      console.log(callData)
    }

    callDataForWithdraw(funcName,token,receiver,amount) {
      let callData;

      if (funcName == "native") {
        callData = MultiSig.methods.withdrawNative(receiver,BigInt(amount*Math.pow(10,18))).encodeABI()
      }
      if (funcName == "token") {
        callData = MultiSig.methods.withdrawToken(token,receiver,BigInt(amount*Math.pow(10,18))).encodeABI()
      }
      console.log(callData)
    }
}

const obj = new Setup();
// obj.callDataForModify("","","",[],"");
// obj.callDataForWithdraw("","","","");
