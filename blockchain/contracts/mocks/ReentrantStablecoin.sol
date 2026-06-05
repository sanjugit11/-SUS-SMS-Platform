// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ISUSCoreReentryTarget {
    function withdraw(uint256 amount) external;
}

interface ISMSCoreReentryTarget {
    function allocate(address user, uint256 amount, address outputStablecoin) external;
}

contract ReentrantStablecoin is ERC20 {
    uint8 private immutable tokenDecimals;
    address private susTarget;
    address private smsTarget;
    address private smsUser;
    bool private attackArmed;
    bool private attackSms;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function armSusAttack(address target) external {
        susTarget = target;
        attackSms = false;
        attackArmed = true;
    }

    function armSmsAttack(address target, address user) external {
        smsTarget = target;
        smsUser = user;
        attackSms = true;
        attackArmed = true;
    }

    function triggerSmsAllocation(uint256 amount) external {
        ISMSCoreReentryTarget(smsTarget).allocate(smsUser, amount, address(this));
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (!attackArmed) return;

        attackArmed = false;
        if (attackSms) {
            try ISMSCoreReentryTarget(smsTarget).allocate(smsUser, 0, address(this)) {} catch {}
        } else {
            try ISUSCoreReentryTarget(susTarget).withdraw(0) {} catch {}
        }
    }
}
