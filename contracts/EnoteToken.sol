// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./mocks/BEP20.sol";
import "./libs/SafeMath.sol";

contract EnoteToken is BEP20("ERace", "eNote"), Ownable {
    using SafeMath for uint256;

    uint256 public cap;           //max cap for eNote (10000e18)
    uint256 public remPoolAmount; // remaining pool amount that can be minted
    address public eNoteMaster;

    constructor(
        uint256 _cap
    ) {
        cap = _cap;
        remPoolAmount = _cap;
    }

    /**
     *@notice Sets eNoteMaster to `_eNoteMaster`. Must only be called by the owner.
     *@param _eNoteMaster Address of master contract to be set
     */
    function setMaster(address _eNoteMaster) public onlyOwner {
        require(
            _eNoteMaster != address(0x0),
            "EnoteToken: Master cannot be zero address"
        );
        eNoteMaster = _eNoteMaster;
    }

    /**
     *@notice Creates `_amount` token to `_to`. Must only be called by the master farmer.
     *@param _to Address to which tokens are minted
     *@param _amount Amount of tokens to be minted
     */
    function mint(address _to, uint256 _amount) public {
        require(
            msg.sender == eNoteMaster,
            "EnoteToken: only master farmer can mint"
        );
        require(remPoolAmount >= _amount, "EnoteToken: mint amount exceeds cap");
        remPoolAmount = remPoolAmount.sub(_amount);
        _mint(_to, _amount);
    }
    
    /**
     *@notice Burns `_amount` token from `_from` address. 
     *@param _amount Amount of tokens to be burned
     */
    function burn(uint256 _amount) public {
        _burn(msg.sender, _amount);
    }
}
