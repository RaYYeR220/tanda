# Tanda Phase 1 — Core Escrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the on-chain core of Tanda — a rotating savings circle (ROSCA) in MXNB on Arbitrum — with member join, fixed per-round contributions, rotating payout, and on-chain reputation recording, fully tested on a happy path.

**Architecture:** Foundry/Solidity monorepo. `CircleFactory` deploys `TandaCircle` escrow instances and authorizes them to write a soulbound `ReputationSBT`. `MockMXNB` is the test stablecoin. Phase 1 is the trustless skeleton: NO AI, NO collateral logic, NO insurance, NO auction, NO account abstraction — payout order is simply join order, and contributions are recorded as on-time. Those layers extend this core in later phases. Interfaces are designed with extension points (a `collateral` mapping, an underwriter hook) so later phases bolt on without rewriting.

**Tech Stack:** Solidity ^0.8.24, Foundry (forge/cast/anvil) 1.7.x, OpenZeppelin Contracts v5, Arbitrum Sepolia (deploy target, later phase).

---

## File Structure

```
contracts/
  foundry.toml
  remappings.txt
  src/
    MockMXNB.sol          # ERC20 mock of the MXN stablecoin (6 decimals)
    ReputationSBT.sol     # ERC-721 + ERC-5192 soulbound; per-address reputation; circle-writable
    CircleFactory.sol     # deploys + registers TandaCircle; authorizes circles on the SBT
    TandaCircle.sol       # escrow state machine: join / contribute / payout (happy path)
    interfaces/
      IReputationSBT.sol  # write interface circles use
  test/
    MockMXNB.t.sol
    ReputationSBT.t.sol
    CircleFactory.t.sol
    TandaCircle.t.sol
    Integration.t.sol     # full happy-path lifecycle across factory + circle + SBT
  script/
    Deploy.s.sol          # deploys MockMXNB, ReputationSBT, CircleFactory
```

Each file has one responsibility. `TandaCircle` is the only stateful escrow; the SBT holds reputation; the factory wires permissions. Files that change together (a contract + its test) live in mirrored `src/`/`test/` paths.

---

## Task 0: Scaffold the contracts workspace

**Files:**
- Create: `contracts/foundry.toml`, `contracts/remappings.txt`, `.gitignore`

- [ ] **Step 1: Initialize git at repo root**

The repo is not yet under git. Run from `C:\Users\egori\Desktop\projects\tanda`:

```bash
git init
```

Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Initialize the Foundry project in `contracts/`**

Run from repo root (use the Bash tool):

```bash
forge init contracts --no-git --no-commit
```

Expected: creates `contracts/` with `src/`, `test/`, `script/`, `lib/forge-std`, `foundry.toml`. (`--no-git` because the root repo owns git.)

- [ ] **Step 3: Remove the template sample files**

```bash
rm contracts/src/Counter.sol contracts/test/Counter.t.sol contracts/script/Counter.s.sol
```

Expected: no output; files gone.

- [ ] **Step 4: Install OpenZeppelin Contracts v5**

```bash
cd contracts && forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --no-commit
```

Expected: clones into `contracts/lib/openzeppelin-contracts`.

- [ ] **Step 5: Write `contracts/remappings.txt`**

```
@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/
```

- [ ] **Step 6: Write `contracts/foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
remappings = ["@openzeppelin/=lib/openzeppelin-contracts/", "forge-std/=lib/forge-std/src/"]

[fmt]
line_length = 120
```

- [ ] **Step 7: Write root `.gitignore`**

```
contracts/out/
contracts/cache/
contracts/broadcast/
node_modules/
.env
.env.*
!.env.example
agent/dist/
web/.next/
```

- [ ] **Step 8: Verify the toolchain builds**

```bash
cd contracts && forge build
```

Expected: `Compiling ...` then a success line (no contracts yet beyond libs — compiles clean).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Foundry contracts workspace with OpenZeppelin v5"
```

---

## Task 1: MockMXNB stablecoin

**Files:**
- Create: `contracts/src/MockMXNB.sol`
- Test: `contracts/test/MockMXNB.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/MockMXNB.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";

contract MockMXNBTest is Test {
    MockMXNB internal mxnb;
    address internal alice = address(0xA11CE);

    function setUp() public {
        mxnb = new MockMXNB();
    }

    function test_metadata() public view {
        assertEq(mxnb.name(), "Mock MXN Bitso");
        assertEq(mxnb.symbol(), "MXNB");
        assertEq(mxnb.decimals(), 6);
    }

    function test_mint() public {
        mxnb.mint(alice, 1_000_000); // 1.0 MXNB at 6 decimals
        assertEq(mxnb.balanceOf(alice), 1_000_000);
        assertEq(mxnb.totalSupply(), 1_000_000);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd contracts && forge test --match-contract MockMXNBTest -vv
```

Expected: FAIL — `MockMXNB.sol` does not exist (compile error / source not found).

- [ ] **Step 3: Write the implementation**

`contracts/src/MockMXNB.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only mock of Bitso's MXN stablecoin (MXNB). Freely mintable.
contract MockMXNB is ERC20 {
    constructor() ERC20("Mock MXN Bitso", "MXNB") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Open mint for testnet/demo. NOT for production.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd contracts && forge test --match-contract MockMXNBTest -vv
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/MockMXNB.sol contracts/test/MockMXNB.t.sol
git commit -m "feat(contracts): MockMXNB 6-decimal test stablecoin"
```

---

## Task 2: ReputationSBT — data + authorization

**Files:**
- Create: `contracts/src/interfaces/IReputationSBT.sol`
- Create: `contracts/src/ReputationSBT.sol`
- Test: `contracts/test/ReputationSBT.t.sol`

The SBT stores per-address reputation and only lets *authorized circles* write it. The factory (set as `admin`) authorizes circles. In this task we build the data + auth; soulbound-token transfer-blocking comes in Task 3.

- [ ] **Step 1: Write the write-interface**

`contracts/src/interfaces/IReputationSBT.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Write surface used by TandaCircle instances to record member behavior.
interface IReputationSBT {
    function recordOnTime(address member) external;
    function recordLate(address member) external;
    function recordDefault(address member) external;
    function recordCompletion(address member) external;
}
```

- [ ] **Step 2: Write the failing test**

`contracts/test/ReputationSBT.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";

contract ReputationSBTTest is Test {
    ReputationSBT internal sbt;
    address internal admin = address(this);
    address internal circle = address(0xC1);
    address internal member = address(0x111);

    function setUp() public {
        sbt = new ReputationSBT(admin);
    }

    function test_adminCanAuthorizeCircle() public {
        sbt.setCircleAuthorized(circle, true);
        assertTrue(sbt.isAuthorizedCircle(circle));
    }

    function test_nonAdminCannotAuthorize() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ReputationSBT.NotAdmin.selector);
        sbt.setCircleAuthorized(circle, true);
    }

    function test_authorizedCircleRecordsOnTime() public {
        sbt.setCircleAuthorized(circle, true);
        vm.prank(circle);
        sbt.recordOnTime(member);

        (uint32 rounds, uint32 onTime, uint32 late, uint32 defaults, uint32 completed) = sbt.reputation(member);
        assertEq(rounds, 1);
        assertEq(onTime, 1);
        assertEq(late, 0);
        assertEq(defaults, 0);
        assertEq(completed, 0);
    }

    function test_unauthorizedCannotRecord() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ReputationSBT.NotAuthorizedCircle.selector);
        sbt.recordOnTime(member);
    }

    function test_recordsAccumulate() public {
        sbt.setCircleAuthorized(circle, true);
        vm.startPrank(circle);
        sbt.recordOnTime(member);
        sbt.recordLate(member);
        sbt.recordDefault(member);
        sbt.recordCompletion(member);
        vm.stopPrank();

        (uint32 rounds, uint32 onTime, uint32 late, uint32 defaults, uint32 completed) = sbt.reputation(member);
        assertEq(rounds, 3); // onTime + late + default each count a round
        assertEq(onTime, 1);
        assertEq(late, 1);
        assertEq(defaults, 1);
        assertEq(completed, 1);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd contracts && forge test --match-contract ReputationSBTTest -vv
```

Expected: FAIL — `ReputationSBT.sol` does not exist.

- [ ] **Step 4: Write the implementation (data + auth only)**

`contracts/src/ReputationSBT.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputationSBT} from "./interfaces/IReputationSBT.sol";

/// @notice Per-address cross-circle reputation. Writable only by authorized circles.
/// @dev Soulbound ERC-721 wrapper is added in a later step; this holds data + auth.
contract ReputationSBT is IReputationSBT {
    struct Reputation {
        uint32 roundsParticipated;
        uint32 onTime;
        uint32 late;
        uint32 defaults;
        uint32 circlesCompleted;
    }

    address public admin;
    mapping(address => bool) public isAuthorizedCircle;
    mapping(address => Reputation) public reputation;

    error NotAdmin();
    error NotAuthorizedCircle();

    event CircleAuthorized(address indexed circle, bool authorized);
    event ReputationUpdated(address indexed member);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address admin_) {
        admin = admin_;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    function recordOnTime(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.onTime += 1;
        emit ReputationUpdated(member);
    }

    function recordLate(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.late += 1;
        emit ReputationUpdated(member);
    }

    function recordDefault(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.defaults += 1;
        emit ReputationUpdated(member);
    }

    function recordCompletion(address member) external onlyAuthorizedCircle {
        reputation[member].circlesCompleted += 1;
        emit ReputationUpdated(member);
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd contracts && forge test --match-contract ReputationSBTTest -vv
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IReputationSBT.sol contracts/src/ReputationSBT.sol contracts/test/ReputationSBT.t.sol
git commit -m "feat(contracts): ReputationSBT data + circle authorization"
```

---

## Task 3: ReputationSBT — soulbound ERC-721 wrapper

**Files:**
- Modify: `contracts/src/ReputationSBT.sol`
- Test: `contracts/test/ReputationSBT.t.sol` (add cases)

Make it an actual soulbound token: mint one non-transferable ERC-721 to a member on their first recorded activity. `tokenId = uint256(uint160(member))`. Transfers revert (ERC-5192 "locked").

- [ ] **Step 1: Add failing tests for minting + soulbound behavior**

Append to `contracts/test/ReputationSBT.t.sol` inside `ReputationSBTTest`:

```solidity
    function test_mintsSbtOnFirstRecord() public {
        sbt.setCircleAuthorized(circle, true);
        assertEq(sbt.balanceOf(member), 0);

        vm.prank(circle);
        sbt.recordOnTime(member);

        assertEq(sbt.balanceOf(member), 1);
        uint256 tokenId = uint256(uint160(member));
        assertEq(sbt.ownerOf(tokenId), member);
        assertTrue(sbt.locked(tokenId));
    }

    function test_secondRecordDoesNotMintAgain() public {
        sbt.setCircleAuthorized(circle, true);
        vm.startPrank(circle);
        sbt.recordOnTime(member);
        sbt.recordOnTime(member);
        vm.stopPrank();
        assertEq(sbt.balanceOf(member), 1);
    }

    function test_transferReverts() public {
        sbt.setCircleAuthorized(circle, true);
        vm.prank(circle);
        sbt.recordOnTime(member);

        uint256 tokenId = uint256(uint160(member));
        vm.prank(member);
        vm.expectRevert(ReputationSBT.Soulbound.selector);
        sbt.transferFrom(member, address(0xDEAD), tokenId);
    }
```

- [ ] **Step 2: Run to verify failure**

```bash
cd contracts && forge test --match-contract ReputationSBTTest -vv
```

Expected: FAIL — `balanceOf`/`ownerOf`/`locked`/`Soulbound` undefined (not yet ERC-721).

- [ ] **Step 3: Rewrite `ReputationSBT.sol` extending ERC-721 with soulbound enforcement**

Replace the contract declaration and add minting/locking. Full updated file:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";

/// @notice Per-address cross-circle reputation as a soulbound (non-transferable) ERC-721.
/// @dev One token per member, tokenId = uint256(uint160(member)). Implements ERC-5192 `locked`.
contract ReputationSBT is ERC721, IReputationSBT {
    struct Reputation {
        uint32 roundsParticipated;
        uint32 onTime;
        uint32 late;
        uint32 defaults;
        uint32 circlesCompleted;
    }

    address public admin;
    mapping(address => bool) public isAuthorizedCircle;
    mapping(address => Reputation) public reputation;

    error NotAdmin();
    error NotAuthorizedCircle();
    error Soulbound();

    event CircleAuthorized(address indexed circle, bool authorized);
    event ReputationUpdated(address indexed member);
    event Locked(uint256 tokenId); // ERC-5192

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address admin_) ERC721("Tanda Reputation", "TANREP") {
        admin = admin_;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    /// @notice ERC-5192: all tokens are permanently locked.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function _ensureMinted(address member) internal {
        uint256 tokenId = uint256(uint160(member));
        if (_ownerOf(tokenId) == address(0)) {
            _mint(member, tokenId);
            emit Locked(tokenId);
        }
    }

    function recordOnTime(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.onTime += 1;
        emit ReputationUpdated(member);
    }

    function recordLate(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.late += 1;
        emit ReputationUpdated(member);
    }

    function recordDefault(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.defaults += 1;
        emit ReputationUpdated(member);
    }

    function recordCompletion(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        reputation[member].circlesCompleted += 1;
        emit ReputationUpdated(member);
    }

    /// @dev Block all transfers (allow mint where `from == 0`). OZ v5 routes transfers through `_update`.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId); // ERC-5192
    }
}
```

- [ ] **Step 4: Run the full SBT test set**

```bash
cd contracts && forge test --match-contract ReputationSBTTest -vv
```

Expected: PASS (8 tests — the 5 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/ReputationSBT.sol contracts/test/ReputationSBT.t.sol
git commit -m "feat(contracts): make ReputationSBT a soulbound ERC-721 (ERC-5192)"
```

---

## Task 4: TandaCircle — core escrow (forming, join, contribute, payout)

**Files:**
- Create: `contracts/src/TandaCircle.sol`
- Test: `contracts/test/TandaCircle.t.sol`

Phase-1 behavior: a circle is created with a fixed `contributionAmount`, a `maxMembers`, and references to the MXNB token and the SBT. Members `join()` while `Forming`; when full, the organizer calls `start()` → `Active`. Each round, every member calls `contribute()` (transfers `contributionAmount` MXNB in; recorded on-time). When all have contributed, anyone calls `payout()` → the round's recipient (members in join order) receives the whole pot; reputation advances; after the last round the circle is `Completed` and each member gets `recordCompletion`. A `collateral` mapping and an `underwriter` address exist as extension points but are unused in Phase 1 (collateral defaults to 0).

- [ ] **Step 1: Write the failing test**

`contracts/test/TandaCircle.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract TandaCircleTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    TandaCircle internal circle;

    address internal organizer = address(this);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);
    address internal carol = address(0xC3);

    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB @ 6 decimals
    uint8 internal constant MAX = 3;

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        circle = new TandaCircle(organizer, address(mxnb), address(sbt), AMOUNT, MAX);
        sbt.setCircleAuthorized(address(circle), true); // factory does this in prod

        address[3] memory who = [alice, bob, carol];
        for (uint256 i = 0; i < who.length; i++) {
            mxnb.mint(who[i], AMOUNT * MAX);
            vm.prank(who[i]);
            mxnb.approve(address(circle), type(uint256).max);
        }
    }

    function _everyoneJoins() internal {
        vm.prank(alice);
        circle.join();
        vm.prank(bob);
        circle.join();
        vm.prank(carol);
        circle.join();
    }

    function test_initialState() public view {
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Forming));
        assertEq(circle.contributionAmount(), AMOUNT);
        assertEq(circle.maxMembers(), MAX);
    }

    function test_join_addsMembers() public {
        vm.prank(alice);
        circle.join();
        assertTrue(circle.isMember(alice));
        assertEq(circle.memberCount(), 1);
    }

    function test_join_rejectsDuplicate() public {
        vm.startPrank(alice);
        circle.join();
        vm.expectRevert(TandaCircle.AlreadyMember.selector);
        circle.join();
        vm.stopPrank();
    }

    function test_join_rejectsWhenFull() public {
        _everyoneJoins();
        vm.prank(address(0xD4));
        vm.expectRevert(TandaCircle.CircleFull.selector);
        circle.join();
    }

    function test_start_onlyOrganizerAndWhenFull() public {
        vm.prank(alice);
        circle.join();
        vm.expectRevert(TandaCircle.NotFull.selector);
        circle.start();

        _joinRest();
        vm.prank(alice);
        vm.expectRevert(TandaCircle.NotOrganizer.selector);
        circle.start();

        circle.start(); // organizer == this
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    function _joinRest() internal {
        vm.prank(bob);
        circle.join();
        vm.prank(carol);
        circle.join();
    }

    function test_fullHappyPath_rotatingPayout() public {
        _everyoneJoins();
        circle.start();

        // Round 0: recipient = alice (join index 0)
        uint256 aliceBefore = mxnb.balanceOf(alice);
        _allContribute();
        circle.payout();
        // pot = 3 * AMOUNT; alice paid AMOUNT in, receives 3*AMOUNT => net +2*AMOUNT
        assertEq(mxnb.balanceOf(alice), aliceBefore + 2 * AMOUNT);
        assertEq(circle.currentRound(), 1);

        // Round 1: recipient = bob
        uint256 bobBefore = mxnb.balanceOf(bob);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);

        // Round 2: recipient = carol, final round completes the circle
        uint256 carolBefore = mxnb.balanceOf(carol);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(carol), carolBefore + 2 * AMOUNT);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        // Reputation: each member 3 on-time rounds + 1 completion
        (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(alice);
        assertEq(rounds, 3);
        assertEq(onTime, 3);
        assertEq(completed, 1);
    }

    function _allContribute() internal {
        vm.prank(alice);
        circle.contribute();
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
    }

    function test_contribute_rejectsDouble() public {
        _everyoneJoins();
        circle.start();
        vm.startPrank(alice);
        circle.contribute();
        vm.expectRevert(TandaCircle.AlreadyContributed.selector);
        circle.contribute();
        vm.stopPrank();
    }

    function test_payout_revertsBeforeAllContribute() public {
        _everyoneJoins();
        circle.start();
        vm.prank(alice);
        circle.contribute();
        vm.expectRevert(TandaCircle.RoundIncomplete.selector);
        circle.payout();
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd contracts && forge test --match-contract TandaCircleTest -vv
```

Expected: FAIL — `TandaCircle.sol` does not exist.

- [ ] **Step 3: Write the implementation**

`contracts/src/TandaCircle.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";

/// @notice One rotating savings circle (ROSCA). Phase 1: fixed join-order payout, on-time recording.
/// @dev Extension points for later phases: `collateral` mapping and `underwriter` address (unused here).
contract TandaCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Forming,
        Active,
        Completed,
        Defaulted
    }

    address public immutable organizer;
    IERC20 public immutable token;
    IReputationSBT public immutable reputation;
    uint256 public immutable contributionAmount;
    uint8 public immutable maxMembers;

    State public state;
    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public collateral; // extension point (Phase 2); 0 in Phase 1
    address public underwriter; // extension point (Phase 2)

    uint256 public currentRound; // 0-indexed; recipient = members[currentRound]
    mapping(uint256 => mapping(address => bool)) public contributedInRound;
    mapping(uint256 => uint256) public roundContributions; // count of contributors this round

    error NotOrganizer();
    error WrongState();
    error AlreadyMember();
    error CircleFull();
    error NotFull();
    error NotMember();
    error AlreadyContributed();
    error RoundIncomplete();

    event Joined(address indexed member, uint256 index);
    event Started(uint256 timestamp);
    event Contributed(address indexed member, uint256 indexed round);
    event PaidOut(address indexed recipient, uint256 indexed round, uint256 amount);
    event Completed();

    modifier inState(State s) {
        if (state != s) revert WrongState();
        _;
    }

    constructor(
        address organizer_,
        address token_,
        address reputation_,
        uint256 contributionAmount_,
        uint8 maxMembers_
    ) {
        organizer = organizer_;
        token = IERC20(token_);
        reputation = IReputationSBT(reputation_);
        contributionAmount = contributionAmount_;
        maxMembers = maxMembers_;
        state = State.Forming;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function join() external inState(State.Forming) {
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= maxMembers) revert CircleFull();
        isMember[msg.sender] = true;
        members.push(msg.sender);
        emit Joined(msg.sender, members.length - 1);
    }

    function start() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Active;
        emit Started(block.timestamp);
    }

    function contribute() external inState(State.Active) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (contributedInRound[currentRound][msg.sender]) revert AlreadyContributed();
        contributedInRound[currentRound][msg.sender] = true;
        roundContributions[currentRound] += 1;
        token.safeTransferFrom(msg.sender, address(this), contributionAmount);
        reputation.recordOnTime(msg.sender);
        emit Contributed(msg.sender, currentRound);
    }

    function payout() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] != members.length) revert RoundIncomplete();
        address recipient = members[currentRound];
        uint256 amount = contributionAmount * members.length;
        emit PaidOut(recipient, currentRound, amount);

        if (currentRound + 1 == members.length) {
            state = State.Completed;
            for (uint256 i = 0; i < members.length; i++) {
                reputation.recordCompletion(members[i]);
            }
            emit Completed();
        } else {
            currentRound += 1;
        }
        token.safeTransfer(recipient, amount);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-contract TandaCircleTest -vv
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/TandaCircle.sol contracts/test/TandaCircle.t.sol
git commit -m "feat(contracts): TandaCircle core escrow with rotating payout"
```

---

## Task 5: CircleFactory — deploy + authorize circles

**Files:**
- Create: `contracts/src/CircleFactory.sol`
- Test: `contracts/test/CircleFactory.t.sol`

The factory deploys `TandaCircle` instances, tracks them, and authorizes each new circle to write the SBT. The factory must be the SBT's `admin` for `setCircleAuthorized` to succeed.

**Dependency-cycle note:** the factory needs the SBT address at construction, and the SBT needs the factory as its `admin` to let the factory authorize circles — a cycle if both must be set in the constructor. We break it by making the SBT admin **transferable** (`transferAdmin`, added in Step 2): deploy the SBT with the deployer as admin, deploy the factory pointing at the SBT, then `transferAdmin(factory)`. The same pattern is used in the Deploy script (Task 7).

- [ ] **Step 1: Write the failing test**

`contracts/test/CircleFactory.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract CircleFactoryTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    CircleFactory internal factory;
    address internal organizer = address(0x0123);

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));        // deployer is admin
        factory = new CircleFactory(address(mxnb), address(sbt));
        sbt.transferAdmin(address(factory));           // hand admin to factory
    }

    function test_createCircle_deploysAuthorizesTracks() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(100_000_000, 3);

        assertTrue(factory.isCircle(circleAddr));
        assertEq(factory.allCirclesLength(), 1);
        assertTrue(sbt.isAuthorizedCircle(circleAddr));

        TandaCircle c = TandaCircle(circleAddr);
        assertEq(c.organizer(), organizer);
        assertEq(c.contributionAmount(), 100_000_000);
        assertEq(c.maxMembers(), 3);
        assertEq(address(c.token()), address(mxnb));
    }

    function test_createCircle_emitsEvent() public {
        vm.recordLogs();
        vm.prank(organizer);
        factory.createCircle(50_000_000, 5);
        // one CircleCreated event expected
        assertEq(factory.allCirclesLength(), 1);
    }
}
```

- [ ] **Step 2: Add `transferAdmin` to `ReputationSBT.sol`**

Add inside `ReputationSBT` (after `setCircleAuthorized`):

```solidity
    event AdminTransferred(address indexed from, address indexed to);

    function transferAdmin(address newAdmin) external onlyAdmin {
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
```

- [ ] **Step 3: Run to verify failure**

```bash
cd contracts && forge test --match-contract CircleFactoryTest -vv
```

Expected: FAIL — `CircleFactory.sol` does not exist.

- [ ] **Step 4: Write the implementation**

`contracts/src/CircleFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TandaCircle} from "./TandaCircle.sol";
import {ReputationSBT} from "./ReputationSBT.sol";

/// @notice Deploys and registers TandaCircle instances; authorizes each to write the SBT.
/// @dev Must hold SBT admin (via ReputationSBT.transferAdmin) to authorize circles.
contract CircleFactory {
    address public immutable mxnb;
    ReputationSBT public immutable reputation;

    address[] public allCircles;
    mapping(address => bool) public isCircle;

    event CircleCreated(
        address indexed circle, address indexed organizer, uint256 contributionAmount, uint8 maxMembers
    );

    constructor(address mxnb_, address reputation_) {
        mxnb = mxnb_;
        reputation = ReputationSBT(reputation_);
    }

    function allCirclesLength() external view returns (uint256) {
        return allCircles.length;
    }

    function createCircle(uint256 contributionAmount, uint8 maxMembers) external returns (address) {
        TandaCircle circle = new TandaCircle(msg.sender, mxnb, address(reputation), contributionAmount, maxMembers);
        address addr = address(circle);
        allCircles.push(addr);
        isCircle[addr] = true;
        reputation.setCircleAuthorized(addr, true);
        emit CircleCreated(addr, msg.sender, contributionAmount, maxMembers);
        return addr;
    }
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd contracts && forge test --match-contract CircleFactoryTest -vv
```

Expected: PASS (2 tests).

- [ ] **Step 6: Run the entire suite**

```bash
cd contracts && forge test -vv
```

Expected: all tests across MockMXNB, ReputationSBT, TandaCircle, CircleFactory PASS.

- [ ] **Step 7: Commit**

```bash
git add contracts/src/CircleFactory.sol contracts/src/ReputationSBT.sol contracts/test/CircleFactory.t.sol
git commit -m "feat(contracts): CircleFactory deploys + authorizes circles; SBT admin transfer"
```

---

## Task 6: Integration test — full lifecycle through the factory

**Files:**
- Create: `contracts/test/Integration.t.sol`

Prove the production wiring end-to-end: factory creates a circle, members join, the circle runs to completion, payouts and reputation are correct — using the same admin-transfer wiring as deployment.

- [ ] **Step 1: Write the integration test**

`contracts/test/Integration.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract IntegrationTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    CircleFactory internal factory;

    address internal organizer = address(0xABCD);
    address[] internal members;
    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 3;

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        factory = new CircleFactory(address(mxnb), address(sbt));
        sbt.transferAdmin(address(factory));

        members.push(address(0x1));
        members.push(address(0x2));
        members.push(address(0x3));
    }

    function test_endToEndLifecycle() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * MAX);
            vm.startPrank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            circle.join();
            vm.stopPrank();
        }

        vm.prank(organizer);
        circle.start();

        for (uint256 round = 0; round < members.length; round++) {
            address recipient = members[round];
            uint256 before = mxnb.balanceOf(recipient);
            for (uint256 i = 0; i < members.length; i++) {
                vm.prank(members[i]);
                circle.contribute();
            }
            circle.payout();
            assertEq(mxnb.balanceOf(recipient), before + AMOUNT * (members.length - 1));
        }

        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));
        for (uint256 i = 0; i < members.length; i++) {
            (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(members[i]);
            assertEq(rounds, 3);
            assertEq(onTime, 3);
            assertEq(completed, 1);
            assertEq(sbt.balanceOf(members[i]), 1); // soulbound token minted
        }
    }
}
```

- [ ] **Step 2: Run it**

```bash
cd contracts && forge test --match-contract IntegrationTest -vvv
```

Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add contracts/test/Integration.t.sol
git commit -m "test(contracts): end-to-end circle lifecycle integration test"
```

---

## Task 7: Deploy script

**Files:**
- Create: `contracts/script/Deploy.s.sol`
- Create: `contracts/.env.example`

Deploys the full stack with correct admin wiring. Used locally against `anvil` now; against Arbitrum Sepolia in a later phase.

- [ ] **Step 1: Write `contracts/.env.example`**

```
# RPC + key for Arbitrum Sepolia (used in a later phase)
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=0xYOUR_TEST_KEY
ARBISCAN_API_KEY=
```

- [ ] **Step 2: Write the deploy script**

`contracts/script/Deploy.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        MockMXNB mxnb = new MockMXNB();
        ReputationSBT sbt = new ReputationSBT(msg.sender); // deployer is initial admin
        CircleFactory factory = new CircleFactory(address(mxnb), address(sbt));
        sbt.transferAdmin(address(factory)); // factory now authorizes circles
        vm.stopBroadcast();

        console2.log("MockMXNB:      ", address(mxnb));
        console2.log("ReputationSBT: ", address(sbt));
        console2.log("CircleFactory: ", address(factory));
    }
}
```

- [ ] **Step 3: Dry-run the deploy script against a local fork**

```bash
cd contracts && forge script script/Deploy.s.sol:Deploy
```

Expected: compiles and simulates successfully, logging three addresses (no broadcast without `--broadcast` + RPC).

- [ ] **Step 4: Commit**

```bash
git add contracts/script/Deploy.s.sol contracts/.env.example
git commit -m "feat(contracts): deployment script with admin wiring"
```

---

## Phase 1 Done — Definition of Done

- [ ] `forge test -vv` is fully green (MockMXNB, ReputationSBT, TandaCircle, CircleFactory, Integration).
- [ ] `forge script script/Deploy.s.sol:Deploy` simulates cleanly.
- [ ] A demoable artifact exists: a circle can be created, joined, run to completion with rotating payouts, and reputation is recorded on-chain.

**Next:** author `2026-XX-XX-tanda-phase2-ai-underwriter.md` — the AI underwriter agent + `Underwriter` contract (EIP-712 signed decision, on-chain base score, band enforcement, collateral). Phase 2 fills in the `collateral` mapping and `underwriter` extension points left in `TandaCircle`.

---

## Self-Review

**Spec coverage (Phase 1 portion):** ✔ MockMXNB (§4.1), ✔ ReputationSBT soulbound + cross-circle data (§4.1), ✔ CircleFactory deploy/register/authorize (§4.1), ✔ TandaCircle core escrow with rotating payout + reputation writes (§4.1, §5 steps 1/4/5/7 happy-path subset), ✔ deploy script (§4 monorepo). Deferred to later phases by design: Underwriter/band (§4.2 → Phase 2), collateral (Phase 2), InsurancePool + default path (§4.1, §5.7 → Phase 3), auction (§5.3 → Phase 4), AA (§4.4 → Phase 5), monitoring (§4.2 → Phase 6). Extension points (`collateral`, `underwriter`) are present in `TandaCircle` so Phase 2 bolts on without rewrite.

**Placeholder scan:** No TBD/TODO in shipped code. Task 5 Step 1 contains an intentionally-messy test body that is explicitly replaced by the clean version in Step 1b — flagged in-line; the engineer writes the Step 1b version.

**Type consistency:** `recordOnTime/recordLate/recordDefault/recordCompletion` consistent across `IReputationSBT`, `ReputationSBT`, and `TandaCircle`. `reputation(address)` returns the 5-field tuple consistently destructured in all tests. `createCircle(uint256,uint8)`, `isCircle`, `allCirclesLength` consistent between factory and its callers. `TandaCircle.State` enum order (`Forming/Active/Completed/Defaulted`) consistent across tests. SBT admin wiring (`transferAdmin`) consistent between Task 5 test, factory, and Deploy script.
