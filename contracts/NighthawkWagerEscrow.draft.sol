// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DRAFT. UNAUDITED. TEST NETWORKS ONLY.
 * Do not deploy with real funds until ALL of these exist: (1) the licence recorded in data/compliance.json for this exact activity and jurisdiction,
 * (2) an independent smart-contract audit, (3) AML/KYC and age/region controls at the point of play, (4) a legal review of the pooled-funds structure.
 *
 * What it is: a non-custodial escrow for ONE winner-takes-pot match. Each player sends the same stake in the chain's native currency. The game server's
 * "oracle" key reports the winner it computed from the authoritative match. Winnings are credited and PULLED by the winner (no pushing ETH, so a hostile
 * receiver cannot block settlement).
 *
 * Trust assumptions (said plainly): the oracle decides the winner, exactly like the server decides hits in the game. A compromised oracle key can misdirect
 * a pot to a PARTICIPANT of that wager (it cannot send it to a stranger and cannot touch other wagers' funds). Funds cannot be trapped: if the oracle never
 * settles, anybody can trigger refunds after TIMEOUT.
 */
contract NighthawkWagerEscrowDraft {
    enum State { None, Open, Locked, Settled, Void }
    struct Wager { uint128 stake; State state; uint64 lockedAt; address[] players; }

    uint256 public constant MAX_PLAYERS = 8;
    uint256 public constant TIMEOUT = 2 days;
    uint256 public immutable minStake; uint256 public immutable maxStake; uint256 public immutable rakeBps;     // rakeBps <= 1000 (10%)
    address public immutable oracle; address public immutable feeReceiver;

    mapping(bytes32 => Wager) private _w;
    mapping(address => uint256) public owed;
    uint256 private _lock = 1;

    event Opened(bytes32 indexed id, uint128 stake); event Joined(bytes32 indexed id, address indexed player); event Locked(bytes32 indexed id);
    event Settled(bytes32 indexed id, address indexed winner, uint256 payout, uint256 rake); event Voided(bytes32 indexed id, string reason); event Withdrawn(address indexed who, uint256 amount);
    error NotOracle(); error BadState(); error BadStake(); error AlreadyIn(); error Full(); error NotPlayer(); error TooEarly(); error NothingOwed(); error Reentrant(); error SendFailed(); error BadConfig();

    constructor(address oracle_, address feeReceiver_, uint256 minStake_, uint256 maxStake_, uint256 rakeBps_) {
        if (oracle_ == address(0) || minStake_ == 0 || maxStake_ < minStake_ || rakeBps_ > 1000) revert BadConfig();
        oracle = oracle_; feeReceiver = feeReceiver_; minStake = minStake_; maxStake = maxStake_; rakeBps = rakeBps_;
    }
    modifier onlyOracle() { if (msg.sender != oracle) revert NotOracle(); _; }
    modifier nonReentrant() { if (_lock != 1) revert Reentrant(); _lock = 2; _; _lock = 1; }

    /// first player opens the wager by joining with the agreed stake
    function join(bytes32 id) external payable {
        Wager storage w = _w[id];
        if (w.state == State.None) { if (msg.value < minStake || msg.value > maxStake || msg.value > type(uint128).max) revert BadStake(); w.stake = uint128(msg.value); w.state = State.Open; emit Opened(id, w.stake); }
        else if (w.state != State.Open) revert BadState();
        if (msg.value != w.stake) revert BadStake();
        if (w.players.length >= MAX_PLAYERS) revert Full();
        for (uint256 i; i < w.players.length; ++i) if (w.players[i] == msg.sender) revert AlreadyIn();
        w.players.push(msg.sender); emit Joined(id, msg.sender);
    }

    /// before the match starts a player can take their stake back
    function leave(bytes32 id) external nonReentrant {
        Wager storage w = _w[id]; if (w.state != State.Open) revert BadState();
        uint256 n = w.players.length; for (uint256 i; i < n; ++i) if (w.players[i] == msg.sender) { w.players[i] = w.players[n - 1]; w.players.pop(); owed[msg.sender] += w.stake; return; }
        revert NotPlayer();
    }

    function lock(bytes32 id) external onlyOracle { Wager storage w = _w[id]; if (w.state != State.Open || w.players.length < 2) revert BadState(); w.state = State.Locked; w.lockedAt = uint64(block.timestamp); emit Locked(id); }

    function settle(bytes32 id, address winner) external onlyOracle {
        Wager storage w = _w[id]; if (w.state != State.Locked) revert BadState();
        bool ok; for (uint256 i; i < w.players.length; ++i) if (w.players[i] == winner) { ok = true; break; }
        if (!ok) revert NotPlayer();
        w.state = State.Settled; uint256 pot = uint256(w.stake) * w.players.length; uint256 rake = (pot * rakeBps) / 10000; uint256 payout = pot - rake;
        owed[winner] += payout; if (rake > 0) owed[feeReceiver] += rake; emit Settled(id, winner, payout, rake);
    }

    function voidWager(bytes32 id, string calldata reason) external onlyOracle { Wager storage w = _w[id]; if (w.state != State.Open && w.state != State.Locked) revert BadState(); _refundAll(id, w, reason); }

    /// the escape hatch: if the oracle disappears, anybody can release everybody's stake after TIMEOUT
    function refundAfterTimeout(bytes32 id) external { Wager storage w = _w[id]; if (w.state != State.Locked) revert BadState(); if (block.timestamp < uint256(w.lockedAt) + TIMEOUT) revert TooEarly(); _refundAll(id, w, "timeout"); }

    function _refundAll(bytes32 id, Wager storage w, string memory reason) private { w.state = State.Void; for (uint256 i; i < w.players.length; ++i) owed[w.players[i]] += w.stake; emit Voided(id, reason); }

    function withdraw() external nonReentrant { uint256 a = owed[msg.sender]; if (a == 0) revert NothingOwed(); owed[msg.sender] = 0; (bool ok, ) = msg.sender.call{value: a}(""); if (!ok) revert SendFailed(); emit Withdrawn(msg.sender, a); }

    function info(bytes32 id) external view returns (State, uint128, uint64, address[] memory) { Wager storage w = _w[id]; return (w.state, w.stake, w.lockedAt, w.players); }
}
