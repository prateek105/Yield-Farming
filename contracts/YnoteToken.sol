// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./mocks/BEP20.sol";

contract YnoteToken is BEP20("Ynote", "Ynote"), Ownable {
    address public yNoteMaster;

    /**
     *@notice Sets yNoteMaster to `_yNoteMaster`. Must only be called by the owner.
     *@param _yNoteMaster Address of master contract to be set
     */

    function setMaster(address _yNoteMaster) public onlyOwner {
        require(
            _yNoteMaster != address(0x0),
            "YnoteToken: Master cannot be zero address"
        );
        yNoteMaster = _yNoteMaster;
    }

    /**
     *@notice Creates `_amount` token to `_to`. Must only be called by the master farmer.
     *@param _to Address to which tokens are minted
     *@param _amount Amount of tokens to be minted
     */
    function mint(address _to, uint256 _amount) public {
        require(
            msg.sender == yNoteMaster,
            "YnoteToken: only master farmer can mint"
        );
        _mint(_to, _amount);
    }
}
