// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DelegatecallAttacker {
    function attack(address target, bytes calldata payload) external returns (bool success, bytes memory data) {
        (success, data) = target.delegatecall(payload);
    }
}
