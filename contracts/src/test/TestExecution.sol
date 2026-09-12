// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
/// @notice LOCAL TEST FIXTURE ONLY. This is not 1inch and must never be used in live mode.
contract TestExecution {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable owner;
    uint256 public outputBps = 10000;
    event Executed(address indexed sender,address indexed recipient,uint256 inputAmount,uint256 outputAmount);
    constructor(address usdc) { token=IERC20(usdc);owner=msg.sender; }
    receive() external payable {}
    function setOutputBps(uint256 value) external {require(msg.sender==owner && value<=10000);outputBps=value;}
    function execute(uint256 amount,address recipient,uint256 requestedOutput) external {
        token.safeTransferFrom(msg.sender,address(this),amount);
        uint256 output=requestedOutput*outputBps/10000;
        (bool ok,)=recipient.call{value:output}("");require(ok);
        emit Executed(msg.sender,recipient,amount,output);
    }
}
