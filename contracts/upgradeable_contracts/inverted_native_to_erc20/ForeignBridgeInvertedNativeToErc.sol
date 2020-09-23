pragma solidity 0.4.24;

import "../BasicForeignBridge.sol";

contract ForeignBridgeInvertedNativeToErc is BasicForeignBridge {
    event UserRequestForAffirmation(address recipient, uint256 value);

    function initialize(
        address _validatorContract,
        uint256 _dailyLimit,
        uint256 _maxPerTx,
        uint256 _minPerTx,
        uint256 _foreignGasPrice,
        uint256 _requiredBlockConfirmations,
        uint256 _homeDailyLimit,
        uint256 _homeMaxPerTx,
        address _owner
    ) external returns (bool) {
        require(!isInitialized());
        require(AddressUtils.isContract(_validatorContract));
        require(_minPerTx > 0 && _maxPerTx > _minPerTx && _dailyLimit > _maxPerTx);
        require(_requiredBlockConfirmations > 0);
        require(_foreignGasPrice > 0);
        require(_homeMaxPerTx < _homeDailyLimit);
        require(_owner != address(0));

        addressStorage[VALIDATOR_CONTRACT] = _validatorContract;
        uintStorage[DAILY_LIMIT] = _dailyLimit;
        uintStorage[DEPLOYED_AT_BLOCK] = block.number;
        uintStorage[MAX_PER_TX] = _maxPerTx;
        uintStorage[MIN_PER_TX] = _minPerTx;
        uintStorage[GAS_PRICE] = _foreignGasPrice;
        uintStorage[REQUIRED_BLOCK_CONFIRMATIONS] = _requiredBlockConfirmations;
        uintStorage[EXECUTION_DAILY_LIMIT] = _homeDailyLimit;
        uintStorage[EXECUTION_MAX_PER_TX] = _homeMaxPerTx;
        setOwner(_owner);

        setInitialize();

        emit RequiredBlockConfirmationChanged(_requiredBlockConfirmations);
        emit GasPriceChanged(_foreignGasPrice);
        emit DailyLimitChanged(_dailyLimit);
        emit ExecutionDailyLimitChanged(_homeDailyLimit);

        return isInitialized();
    }

    function getBridgeMode() external pure returns (bytes4 _data) {
        return bytes4(keccak256(abi.encodePacked("inverted-native-to-erc-core")));
    }

    function onExecuteMessage(
        address _recipient,
        uint256 _amount,
        bytes32 /*_txHash*/
    ) internal returns (bool) {
        setTotalExecutedPerDay(getCurrentDay(), totalExecutedPerDay(getCurrentDay()).add(_amount));
        if (!_recipient.send(_amount)) {
            (new Sacrifice).value(_amount)(_recipient);
        }
        return true;
    }

    function onFailedMessage(address, uint256, bytes32) internal {
        revert();
    }

    function() public payable {
        nativeTransfer();
    }

    function nativeTransfer() internal {
        require(msg.value > 0);
        require(msg.data.length == 0);
        require(withinLimit(msg.value));
        setTotalSpentPerDay(getCurrentDay(), totalSpentPerDay(getCurrentDay()).add(msg.value));
        emit UserRequestForAffirmation(msg.sender, msg.value);
    }

}
