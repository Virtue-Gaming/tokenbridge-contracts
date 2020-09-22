pragma solidity 0.4.24;

import "../../libraries/Message.sol";
import "../../upgradeability/EternalStorage.sol";
import "../../interfaces/IBurnableMintableERC677Token.sol";
import "../BasicHomeBridge.sol";
import "../OverdrawManagement.sol";
import "../ERC677BridgeForBurnableMintableToken.sol";

contract HomeBridgeInvertedNativeToErc is
    EternalStorage,
    BasicHomeBridge,
    ERC677BridgeForBurnableMintableToken,
    OverdrawManagement
{
    event AmountLimitExceeded(address recipient, uint256 value, bytes32 transactionHash);

    function initialize(
        address _validatorContract,
        uint256 _dailyLimit,
        uint256 _maxPerTx,
        uint256 _minPerTx,
        uint256 _homeGasPrice,
        uint256 _requiredBlockConfirmations,
        address _erc677token,
        uint256 _foreignDailyLimit,
        uint256 _foreignMaxPerTx,
        address _owner
    ) external returns (bool) {
        _initialize(
            _validatorContract,
            _dailyLimit,
            _maxPerTx,
            _minPerTx,
            _homeGasPrice,
            _requiredBlockConfirmations,
            _erc677token,
            _foreignDailyLimit,
            _foreignMaxPerTx,
            _owner
        );
        setInitialize();

        return isInitialized();
    }

    function _initialize(
        address _validatorContract,
        uint256 _dailyLimit,
        uint256 _maxPerTx,
        uint256 _minPerTx,
        uint256 _homeGasPrice,
        uint256 _requiredBlockConfirmations,
        address _erc677token,
        uint256 _foreignDailyLimit,
        uint256 _foreignMaxPerTx,
        address _owner
    ) internal {
        require(!isInitialized());
        require(AddressUtils.isContract(_validatorContract));
        require(_requiredBlockConfirmations > 0);
        require(_minPerTx > 0 && _maxPerTx > _minPerTx && _dailyLimit > _maxPerTx);
        require(_foreignMaxPerTx < _foreignDailyLimit);
        require(_owner != address(0));
        addressStorage[VALIDATOR_CONTRACT] = _validatorContract;
        uintStorage[DEPLOYED_AT_BLOCK] = block.number;
        uintStorage[DAILY_LIMIT] = _dailyLimit;
        uintStorage[MAX_PER_TX] = _maxPerTx;
        uintStorage[MIN_PER_TX] = _minPerTx;
        uintStorage[GAS_PRICE] = _homeGasPrice;
        uintStorage[REQUIRED_BLOCK_CONFIRMATIONS] = _requiredBlockConfirmations;
        uintStorage[EXECUTION_DAILY_LIMIT] = _foreignDailyLimit;
        uintStorage[EXECUTION_MAX_PER_TX] = _foreignMaxPerTx;
        setOwner(_owner);
        setErc677token(_erc677token);

        emit RequiredBlockConfirmationChanged(_requiredBlockConfirmations);
        emit GasPriceChanged(_homeGasPrice);
        emit DailyLimitChanged(_dailyLimit);
        emit ExecutionDailyLimitChanged(_foreignDailyLimit);
    }

    function claimTokensFromErc677(address _token, address _to) external onlyIfUpgradeabilityOwner {
        IBurnableMintableERC677Token(erc677token()).claimTokens(_token, _to);
    }

    function getBridgeMode() external pure returns (bytes4 _data) {
        return bytes4(keccak256(abi.encodePacked("inverted-native-to-erc-core")));
    }

    function setFrontierAddress(address _frontierAddress) public onlyOwner {
        addressStorage[keccak256(abi.encodePacked("frontierContract"))] = _frontierAddress;
    }

    function getFrontierAddress() public view returns (address){
        return addressStorage[keccak256(abi.encodePacked("frontierContract"))];
    }

    function unpackWithdrawData(bytes _depositData) public pure returns(address recipient) {
        require(_depositData.length == 20, "Invalid data");

        assembly { // Will be substituted with abi.decode on solidity 5.0
            recipient := mload(add(_depositData, 20))
        }

        return (recipient);
    }	    

    function getSenderOfTokenTransfer(
        address _from,
        uint256 /* _value */,
        bytes _data
    ) internal returns (address) {
        address frontierAddress = getFrontierAddress();

        if(frontierAddress != address(0)){
            require(_from == frontierAddress, "Frontier is not sender");
            return unpackWithdrawData(_data);
        }
        return _from;
    }

    function onExecuteAffirmation(address _recipient, uint256 _value, bytes32 /* txHash */) internal returns (bool) {
        setTotalExecutedPerDay(getCurrentDay(), totalExecutedPerDay(getCurrentDay()).add(_value));
        address frontierAddress = getFrontierAddress();

        if(frontierAddress != address(0)){
            return IBurnableMintableERC677Token(erc677token()).mint(this, _value) && IBurnableMintableERC677Token(erc677token()).transferAndCall(frontierAddress, _value, abi.encodePacked(_recipient));
        }else {
            return IBurnableMintableERC677Token(erc677token()).mint(_recipient, _value);
        }
    }

    function fireEventOnTokenTransfer(address _from, uint256 _value) internal {
        emit UserRequestForSignature(_from, _value);
    }

    function onFailedAffirmation(address _recipient, uint256 _value, bytes32 _txHash) internal {
        address recipient;
        uint256 value;
        (recipient, value) = txAboveLimits(_txHash);
        require(recipient == address(0) && value == 0);
        setOutOfLimitAmount(outOfLimitAmount().add(_value));
        setTxAboveLimits(_recipient, _value, _txHash);
        emit AmountLimitExceeded(_recipient, _value, _txHash);
    }
}
