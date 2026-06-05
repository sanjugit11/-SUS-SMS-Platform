// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract SUSCore is Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct Account {
        address principalStablecoin;
        uint256 balance;
    }

    mapping(address => bool) private supportedStablecoins;
    mapping(address => Account) private accounts;

    address private immutable self;
    bool private reentrancyLock;

    event Deposited(address indexed user, address stablecoin, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ReentrancyAttemptDetected(address indexed user, bytes4 selector);

    error UnsupportedStablecoin(address stablecoin);
    error PrincipalStablecoinLocked(address currentStablecoin);
    error InsufficientBalance(uint256 requested, uint256 available);
    error DelegatecallBlocked();
    error ReentrancyBlocked();

    constructor(address[] memory initialStablecoins, address initialOwner) Ownable(initialOwner) {
        self = address(this);
        for (uint256 i = 0; i < initialStablecoins.length; i++) {
            supportedStablecoins[initialStablecoins[i]] = true;
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

    function deposit(address stablecoin, uint256 amount) external whenNotPaused noDelegateCall nonReentrantAlert {
        if (!supportedStablecoins[stablecoin]) revert UnsupportedStablecoin(stablecoin);
        Account storage account = accounts[msg.sender];
        if (account.balance > 0 && account.principalStablecoin != stablecoin) {
            revert PrincipalStablecoinLocked(account.principalStablecoin);
        }

        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), amount);
        account.principalStablecoin = stablecoin;
        account.balance += amount;
        emit Deposited(msg.sender, stablecoin, amount);
    }

    function withdraw(uint256 amount) external whenNotPaused noDelegateCall nonReentrantAlert {
        Account storage account = accounts[msg.sender];
        if (account.balance < amount) revert InsufficientBalance(amount, account.balance);

        account.balance -= amount;
        IERC20(account.principalStablecoin).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function debitForAllocation(address user, uint256 amount) external onlyOwner whenNotPaused noDelegateCall nonReentrantAlert {
        Account storage account = accounts[user];
        if (account.balance < amount) revert InsufficientBalance(amount, account.balance);
        account.balance -= amount;
    }

    function getBalance(address user) external view returns (uint256 balance, address principalStablecoin) {
        Account storage account = accounts[user];
        return (account.balance, account.principalStablecoin);
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
