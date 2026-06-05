// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract SMSCore is Ownable, Pausable {
    using SafeERC20 for IERC20;

    mapping(address => bool) private supportedStablecoins;
    mapping(address => mapping(address => uint256)) private allocatedBalances;

    address public immutable inputStablecoin;
    address private immutable self;
    bool private reentrancyLock;

    event Allocated(address indexed user, uint256 amount, address inputStablecoin, address outputStablecoin);
    event ReentrancyAttemptDetected(address indexed user, bytes4 selector);

    error UnsupportedStablecoin(address stablecoin);
    error DelegatecallBlocked();
    error ReentrancyBlocked();

    constructor(address initialInputStablecoin, address[] memory outputStablecoins, address initialOwner) Ownable(initialOwner) {
        inputStablecoin = initialInputStablecoin;
        self = address(this);
        for (uint256 i = 0; i < outputStablecoins.length; i++) {
            supportedStablecoins[outputStablecoins[i]] = true;
        }
    }

    modifier noDelegateCall() {
        if (address(this) != self) revert DelegatecallBlocked();
        _;
    }

    modifier nonReentrantAlert() {
        if (reentrancyLock) {
            emit ReentrancyAttemptDetected(msg.sender, msg.sig);
            revert ReentrancyBlocked();
        }
        reentrancyLock = true;
        _;
        reentrancyLock = false;
    }

    function allocate(address user, uint256 amount, address outputStablecoin)
        external
        onlyOwner
        whenNotPaused
        noDelegateCall
        nonReentrantAlert
    {
        if (!supportedStablecoins[outputStablecoin]) revert UnsupportedStablecoin(outputStablecoin);
        allocatedBalances[user][outputStablecoin] += amount;
        IERC20(outputStablecoin).safeTransfer(user, amount);
        emit Allocated(user, amount, inputStablecoin, outputStablecoin);
    }

    function getAllocatedBalance(address user, address stablecoin) external view returns (uint256) {
        return allocatedBalances[user][stablecoin];
    }

    function isStablecoinSupported(address stablecoin) external view returns (bool) {
        return supportedStablecoins[stablecoin];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
