// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface IBondProbe { function settleSuccess(bytes32 id, bytes32 evidence) external; }
/// @notice Adversarial test token; never deploy with live funds.
contract ReentrantToken is ERC20 {
    address public bond;
    bytes32 public secondId;
    bool public attempted;
    bool public reentered;
    constructor() ERC20("Reentrant test token", "TEST") {}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
    function trigger(address target,bytes32 first,bytes32 second) external {
        bond=target;secondId=second;
        IBondProbe(target).settleSuccess(first,bytes32(uint256(1)));
    }
    function _update(address from,address to,uint256 value) internal override {
        super._update(from,to,value);
        if(bond!=address(0) && from==bond && !attempted){
            attempted=true;
            try IBondProbe(bond).settleSuccess(secondId,bytes32(uint256(1))) {reentered=true;} catch {}
        }
    }
}
