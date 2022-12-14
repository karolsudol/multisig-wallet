// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

/**
 * Write a multisig wallet contract. Specify the owners (save to mapping), const minQuorum

Functions to be implemented:

propose(address, calldata) - can be sent only by one of the owners
confirm(uint id) - confirms a particular proposed transaction
executeTransaction(uint id) - gets calldata, checks minimum number of approvals
add/remove/changeQuorum - these function should be called by the contract itself
 */

interface IMultiSigWallet {
    // owners_ - initial owners
    // constructor(address[] memory owners_);

    /**
     * @notice Execute a multi-signature transaction.
     * @param _to The destination address to send an outgoing transaction.
     * @param _amount The amount in Wei to be sent.
     * @param _data The data to send to the to when invoking the transaction.
     * @param _multiSignature The array of multi signatures.
     */
    function execute(
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes[] calldata _multiSignature
    ) external;

    /**
     * @notice Adding or removing signer.
     * @dev Can be only called by multisig contract itself.
     * @param _owner The signer address.
     * @param _isAdded If true, a new signer will be added, otherwise, remove.
     */
    function updateOwner(address _owner, bool _isAdded) external;
}

contract MultiSigWallet {
    /* ======================= EVENTS ======================= */

    event Deposit(address indexed sender, uint amount, uint balance);
    event SubmitTransaction(
        address indexed owner,
        uint indexed txIndex,
        address indexed to,
        uint value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint indexed txIndex);
    event OwnerAddition(address indexed owner);
    event OwnerRemoval(address indexed owner);
    event QuorumChange(uint quorum);

    /* ======================= CONSTANTS ======================= */

    uint public constant MAX_OWNER_COUNT = 10;

    /* ======================= STATE VARS ======================= */

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint public quorum;

    struct Transaction {
        address to;
        uint value;
        bytes data;
        bool executed;
        uint numConfirmations;
    }

    // mapping from tx index => owner => bool
    mapping(uint => mapping(address => bool)) public isConfirmed;

    Transaction[] public transactions;

    /* ======================= MODIFIERS ======================= */

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier txExists(uint _txIndex) {
        require(_txIndex < transactions.length, "tx does not exist");
        _;
    }

    modifier notExecuted(uint _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    modifier notConfirmed(uint _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "tx already confirmed");
        _;
    }

    modifier ownerDoesNotExist(address owner) {
        require(!isOwner[owner], "owner does not exist");
        _;
    }

    modifier ownerExists(address owner) {
        require(isOwner[owner], "owner exists");
        _;
    }

    modifier onlyWallet() {
        require(msg.sender == address(this), "only wallet");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "invalid address");
        _;
    }

    modifier validQuorum(uint ownerCount, uint _quorum) {
        require(
            ownerCount <= MAX_OWNER_COUNT &&
                _quorum <= ownerCount &&
                _quorum != 0 &&
                ownerCount != 0,
            "invalid quorum"
        );
        _;
    }

    /* ======================= CONSTRUCTOR ======================= */

    constructor(address[] memory _owners, uint _quorum) {
        require(_owners.length > 0, "owners required");
        require(
            _quorum > 0 && _quorum <= _owners.length,
            "invalid number of required confirmations"
        );

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        quorum = _quorum;
    }

    /* ======================= VIEW FUNCTIONS ======================= */

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint) {
        return transactions.length;
    }

    function getTransaction(uint _txIndex)
        public
        view
        returns (
            address to,
            uint value,
            bytes memory data,
            bool executed,
            uint numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }

    /* ======================= UPDATE OWNER FUNCTIONS ======================= */

    /// @dev Allows to add a new owner. Transaction has to be sent by wallet.
    /// @param owner Address of new owner.
    function addOwner(address owner)
        public
        onlyWallet
        ownerDoesNotExist(owner)
        validAddress(owner)
        validQuorum(owners.length + 1, quorum)
    {
        isOwner[owner] = true;
        owners.push(owner);
        emit OwnerAddition(owner);
    }

    /// @dev Allows to remove an owner. Transaction has to be sent by wallet.
    /// @param owner Address of owner.
    function removeOwner(address owner) public onlyWallet ownerExists(owner) {
        isOwner[owner] = false;
        for (uint i = 0; i < owners.length - 1; i++)
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }

        if (quorum > owners.length) changeQuorum(owners.length);
        emit OwnerRemoval(owner);
    }

    /// @dev Allows to replace an owner with a new owner. Transaction has to be sent by wallet.
    /// @param owner Address of owner to be replaced.
    /// @param newOwner Address of new owner.
    function replaceOwner(address owner, address newOwner)
        public
        onlyWallet
        ownerExists(owner)
        ownerDoesNotExist(newOwner)
    {
        for (uint i = 0; i < owners.length; i++)
            if (owners[i] == owner) {
                owners[i] = newOwner;
                break;
            }
        isOwner[owner] = false;
        isOwner[newOwner] = true;
        emit OwnerRemoval(owner);
        emit OwnerAddition(newOwner);
    }

    /* ======================= EXTERNAL FUNCTIONS ======================= */

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function submitTransaction(
        address _to,
        uint _value,
        bytes calldata _data
    ) public onlyOwner {
        uint txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 0
            })
        );

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    function confirmTransaction(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    function executeTransaction(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numConfirmations >= quorum,
            "not enough confirmation to execute"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "tx failed");

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    function revokeConfirmation(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(isConfirmed[_txIndex][msg.sender], "tx not confirmed");

        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    /// @dev Allows to change the number of required confirmations. Transaction has to be sent by wallet.
    /// @param _quorum Number of required confirmations.
    function changeQuorum(uint _quorum)
        public
        onlyWallet
        validQuorum(owners.length, _quorum)
    {
        quorum = _quorum;
        emit QuorumChange(_quorum);
    }
}
