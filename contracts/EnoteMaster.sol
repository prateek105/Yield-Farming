// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./libs/SafeBEP20.sol";
import "./libs/SafeMath.sol";
import "./EnoteToken.sol";

contract EnoteMaster is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    struct UserInfo {
        uint256 amount; // How many yNote tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardToClaim; //Total reward to be claimed
        //
        // We do some fancy math here. Basically, any point in time, the amount of eNotes
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * YnotePool.rewardPerShare) - user.rewardDebt

        // Whenever a user deposits tokens to the YnotePool. Here's what happens:
        //   1. The YnotePool's `rewardPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User.s pending rewards is added to user's 'rewardToClaim'
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each YnotePool.
    struct PoolInfo {
        IBEP20 lpToken;         //  YnotePool contract address
        uint256 lastRewardBlock;
        uint256 rewardPerShare; //amount of eNote per yNote token
    }

    // The eNote TOKEN!
    EnoteToken public eNote;
    // eNote tokens created per block.
    uint256 public REWARD_PER_BLOCK;
    //start of staking period
    uint256 public START_BLOCK;
    // start of claiming period
    uint256 public END_BLOCK;
    // Info of YnotePool.
    PoolInfo public YnotePool;
    // Info of each user that stakes LP tokens. user address => info
    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor(
        EnoteToken _eNote,
        uint256 _rewardPerBlock,
        uint256 _START_BLOCK,
        uint256 _END_BLOCK,
        IBEP20 yNote
    ) {
        eNote = _eNote;
        REWARD_PER_BLOCK = _rewardPerBlock;
        START_BLOCK = _START_BLOCK;
        END_BLOCK = _END_BLOCK;
        YnotePool =  PoolInfo(yNote,START_BLOCK,0);
    }


    /**
     *@notice Mint tokens for master contract and updates pools to have latest rewardPerShare
     */
    function updatePool() public {
        //won't mine until sale starts after start block
        if (block.number <= YnotePool.lastRewardBlock) {
            return;
        }
        //total staked in YnotePool
        uint256 lpSupply = YnotePool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            YnotePool.lastRewardBlock = block.number;
            return;
        }
        uint256 reward =
            getPoolReward(YnotePool.lastRewardBlock, block.number);
        eNote.mint(address(this), reward);
        //amount of eNote per token
        YnotePool.rewardPerShare = YnotePool.rewardPerShare.add(
            reward.mul(1e12).div(lpSupply)
        );
        YnotePool.lastRewardBlock = block.number;
    }

    /**
     *@notice Deposits `_amount` from user's balance to YnotePool `_pid`
     *@param _amount Number of tokens to be deposited
     */
    function deposit(
        uint256 _amount
    ) public {
        require(
            block.number >= START_BLOCK,
            "EnoteMaster: Staking period has not started"
        );
        require(
            block.number < END_BLOCK,
            "EnoteMaster: Staking period has ended"
        );

        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(YnotePool.rewardPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            user.rewardToClaim += pending;
        }
        if (_amount > 0) {
            YnotePool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );            
            user.amount = user.amount.add(_amount);
        }
        
        user.rewardDebt = user.amount.mul(YnotePool.rewardPerShare).div(1e12);
        emit Deposit(msg.sender, _amount);
    }

    /**
     *@notice Withdraws `_amount` nu. of tokens from YnotePool `_pid`
     *@param _amount Amount to be withdrawn
     */
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount != 0, "EnoteMaster: No tokens staked");
        require(user.amount >= _amount, "EnoteMaster : Withdraw not good");
        updatePool();
        uint256 pending =
            user.amount.mul(YnotePool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            YnotePool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(YnotePool.rewardPerShare).div(1e12);
        emit Withdraw(msg.sender, user.amount);
    }

    /**
     *@notice Withdraws all tokens from YnotePool `_pid` and sends eNote reward tokens and staked tokens to user
     */
    function harvest() public {
        require(
            block.number >= END_BLOCK,
            "EnoteMaster: Staking period is in progress"
        );

        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        uint256 pending =
            user.amount.mul(YnotePool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;  

        require(user.rewardToClaim != 0, "EnoteMaster: No rewards to claim");

        if (user.rewardToClaim > 0) {
            safeTransferReward(msg.sender, user.rewardToClaim);
        }
        
        YnotePool.lpToken.safeTransfer(address(msg.sender), user.amount);
        user.amount = 0;
        user.rewardToClaim = 0;
        user.rewardDebt = 0;
    }


    /**
     *@notice To avoid rounding error causing YnotePool to not have enough eNotes.
     *@param _to Address to which amount is transferred
     *@param _amount Amount to be transferred
     */
    function safeTransferReward(address _to, uint256 _amount) internal {
        uint256 bal = eNote.balanceOf(address(this));
        if (_amount > bal) {
            eNote.transfer(_to, bal);
        } else {
            eNote.transfer(_to, _amount);
        }
    }

    /**
     *@notice Returns reward multiplier over the given `_from` to `_to` block.
     *@param _from Block number from which multiplier is to calculated
     *@param _to Block number till which multiplier is to calculated
     */
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= START_BLOCK || _from >= _to) {
            return 0;
        } else if (_to > START_BLOCK && _to <= END_BLOCK) {
            if (_from <= START_BLOCK) {
                return _to.sub(START_BLOCK);
            } else {
                return _to.sub(_from);
            }
        } else {
            if (_from <= END_BLOCK) {
                return END_BLOCK.sub(_from);
            } else {
                return 0;
            }
        }
    }

    /**
     *@notice Returns amount of eNote to be minted for YnotePool for duration of `_from` to `_to` block
     *@param _from Block number from which multiplier is to calculated
     *@param _to Block number till which multiplier is to calculated
     */
    function getPoolReward(
        uint256 _from,
        uint256 _to
    ) public view returns (uint256) {
        uint256 multiplier = getMultiplier(_from, _to);
        uint256 amount =
            multiplier.mul(REWARD_PER_BLOCK);
        uint256 amountCanMint = eNote.remPoolAmount();
        return amountCanMint < amount ? amountCanMint : amount;
    }

    /**
     *@notice Returns amount staked by address `_user` in YnotePool `_pid`
     *@param _user User address
     */
    function getStakedAmount(address _user)
        public
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_user];
        return user.amount;
    }

    /**
     *@notice Returns total reward generated for the user `_user` in YnotePool `_pid`
     *@param _user User address
     */
    function pendingReward( address _user)
        external
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_user];
        uint256 rewardPerShare = YnotePool.rewardPerShare;
        uint256 lpSupply = YnotePool.lpToken.balanceOf(address(this));
        if (block.number > YnotePool.lastRewardBlock && lpSupply > 0) {
            uint256 reward =
                getPoolReward(
                    YnotePool.lastRewardBlock,
                    block.number
                );
            rewardPerShare = rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return
            user.rewardToClaim +
            user.amount.mul(rewardPerShare).div(1e12).sub(user.rewardDebt);
    }
}
