# MULTISIGNATURE WALLET

- `propose(address, calldata)` - can be sent only by one of the owners
- `confirm(uint id)` - confirms a particular proposed transaction
- `executeTransaction(uint id`) - gets calldata, checks minimum number of approvals
- `add/remove/changeQuorum` - these function should be called by the contract itself

- `MultiSigWallet` Deployed and Verified on [goerli]()

- with [owner]()

## hardhat tasks:

- `npm install hardhat`
- `npx hardhat coverage`
- `npx hardhat run --network goerli scripts/deployMultiSigWallet.ts`
- `npx hardhat verify --network goerli xx "xx" "xx"`

## coverage

<br/>
<p align="center">
<img src="img/coverage.png">
</a>
</p>
<br/>
