pragma solidity 0.4.24;

import "../interfaces/ERC677Receiver.sol";
import "../interfaces/ERC677.sol";

contract FrontierMock is ERC677Receiver {
    address public tokenAddress;
    address public bridgeAddress;

    constructor(address _tokenAddress, address _bridgeAddress) public {
        tokenAddress = _tokenAddress;
        bridgeAddress = _bridgeAddress;
    }

    function unpackDepositData(bytes _depositData) public pure returns(address recipient) {
        require(_depositData.length == 20, "Invalid data");

        assembly { // Will be substituted with abi.decode on solidity 5.0
            recipient := mload(add(_depositData, 20))
        }

        return (recipient);
    }	 
    
    function onTokenTransfer(address _from, uint256 _value, bytes _data) external returns (bool) {
        require(msg.sender == tokenAddress);

        if(_from == bridgeAddress){
            address recipient = unpackDepositData(_data);
            require(ERC677(tokenAddress).transfer(recipient, _value));
        }else{
            require(ERC677(tokenAddress).transferAndCall(bridgeAddress, _value, abi.encodePacked(_from)));
        }
    }
}
