pragma solidity 0.4.24;

import "./ERC677BridgeToken.sol";

contract CustomizableERC677BridgeToken is ERC677BridgeToken {
    event DetailsUpdated(string name, string symbol, uint8 decimals);

    constructor(string _name, string _symbol, uint8 _decimals) public ERC677BridgeToken(_name, _symbol, _decimals) {
        emit DetailsUpdated(_name, _symbol, _decimals);
    }

    function updateDetails(string _name, string _symbol, uint8 _decimals) public onlyOwner {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        emit DetailsUpdated(_name, _symbol, _decimals);
    }

}
