// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {StarPayPayments} from "../StarPayPayments.sol";

/// 6-decimal mock USDC with a blocklist that reverts transfers involving blocked accounts.
contract MockUSDC is ERC20 {
    error Blocklisted(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert Blocklisted(from);
        if (blocked[to]) revert Blocklisted(to);
        super._update(from, to, value);
    }
}

contract StarPayPaymentsTest is Test {
    event PaymentReceived(
        bytes32 indexed invoiceRef,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        bytes32 paymentId
    );

    StarPayPayments internal pay;
    MockUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal merchant = makeAddr("merchant");
    address internal merchant2 = makeAddr("merchant2");
    bytes32 internal constant REF = keccak256("invoice-1");
    uint256 internal constant AMT = 25e6;

    function setUp() public {
        usdc = new MockUSDC();
        pay = new StarPayPayments(address(usdc));
        usdc.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usdc.approve(address(pay), type(uint256).max);
    }

    // ---------------- constructor ----------------

    function test_Constructor_StoresUsdc() public view {
        assertEq(address(pay.usdc()), address(usdc));
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(StarPayPayments.InvalidUSDC.selector);
        new StarPayPayments(address(0));
    }

    // ---------------- pay: happy path ----------------

    function test_Pay_MovesUsdcDirectlyPayerToMerchant() public {
        uint256 pBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        assertEq(usdc.balanceOf(payer), pBefore - AMT);
        assertEq(usdc.balanceOf(merchant), AMT);
        assertEq(usdc.balanceOf(address(pay)), 0, "router must hold nothing");
    }

    function test_Pay_EmitsPaymentReceived() public {
        bytes32 id = pay.paymentIdOf(REF, merchant, AMT);
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentReceived(REF, merchant, payer, AMT, id);
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
    }

    function test_Pay_MarksPaid() public {
        assertFalse(pay.isPaid(REF, merchant, AMT));
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        assertTrue(pay.isPaid(REF, merchant, AMT));
        assertTrue(pay.paid(pay.paymentIdOf(REF, merchant, AMT)));
    }

    function test_PaymentIdOf_MatchesAbiEncodedHash() public view {
        assertEq(pay.paymentIdOf(REF, merchant, AMT), keccak256(abi.encode(REF, merchant, AMT)));
    }

    function test_IsPaid_FalseForUnpaid() public view {
        assertFalse(pay.isPaid(REF, merchant, AMT));
        assertFalse(pay.paid(bytes32(uint256(1))));
    }

    function test_Pay_ExactAllowanceAndExactBalance() public {
        address p = makeAddr("exact");
        usdc.mint(p, 7e6);
        vm.startPrank(p);
        usdc.approve(address(pay), 7e6);
        pay.pay(REF, merchant, 7e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(p), 0);
        assertEq(usdc.allowance(p, address(pay)), 0);
        assertEq(usdc.balanceOf(merchant), 7e6);
    }

    // ---------------- pay: input reverts ----------------

    function test_Revert_ZeroInvoiceRef() public {
        vm.prank(payer);
        vm.expectRevert(StarPayPayments.InvalidInvoiceRef.selector);
        pay.pay(bytes32(0), merchant, AMT);
    }

    function test_Revert_ZeroMerchant() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StarPayPayments.InvalidMerchant.selector, address(0)));
        pay.pay(REF, address(0), AMT);
    }

    function test_Revert_MerchantIsRouter() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StarPayPayments.InvalidMerchant.selector, address(pay)));
        pay.pay(REF, address(pay), AMT);
    }

    function test_Revert_MerchantIsUsdc() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StarPayPayments.InvalidMerchant.selector, address(usdc)));
        pay.pay(REF, address(usdc), AMT);
    }

    function test_Revert_ZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(StarPayPayments.InvalidAmount.selector);
        pay.pay(REF, merchant, 0);
    }

    function test_Revert_DuplicateExactTerms() public {
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        bytes32 id = pay.paymentIdOf(REF, merchant, AMT);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(StarPayPayments.AlreadyPaid.selector, id));
        pay.pay(REF, merchant, AMT);
    }

    function test_Revert_DuplicateExactTerms_DifferentPayer() public {
        address other = makeAddr("other");
        usdc.mint(other, AMT);
        vm.prank(other);
        usdc.approve(address(pay), AMT);
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        bytes32 id = pay.paymentIdOf(REF, merchant, AMT);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(StarPayPayments.AlreadyPaid.selector, id));
        pay.pay(REF, merchant, AMT);
    }

    // ---------------- pay: token failures ----------------

    function test_Revert_InsufficientBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, AMT - 1);
        vm.startPrank(poor);
        usdc.approve(address(pay), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, AMT - 1, AMT)
        );
        pay.pay(REF, merchant, AMT);
        vm.stopPrank();
        assertFalse(pay.isPaid(REF, merchant, AMT));
    }

    function test_Revert_InsufficientAllowance() public {
        address p = makeAddr("lowAllow");
        usdc.mint(p, AMT);
        vm.startPrank(p);
        usdc.approve(address(pay), AMT - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(pay), AMT - 1, AMT
            )
        );
        pay.pay(REF, merchant, AMT);
        vm.stopPrank();
        assertFalse(pay.isPaid(REF, merchant, AMT));
        assertEq(usdc.balanceOf(p), AMT);
    }

    function test_Revert_BlocklistedMerchant_LeavesPaidFalse() public {
        usdc.setBlocked(merchant, true);
        uint256 before_ = usdc.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blocklisted.selector, merchant));
        pay.pay(REF, merchant, AMT);
        assertFalse(pay.isPaid(REF, merchant, AMT), "paid must roll back");
        assertEq(usdc.balanceOf(payer), before_);
        assertEq(usdc.balanceOf(merchant), 0);
    }

    function test_Revert_BlocklistedPayer() public {
        usdc.setBlocked(payer, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blocklisted.selector, payer));
        pay.pay(REF, merchant, AMT);
        assertFalse(pay.isPaid(REF, merchant, AMT));
    }

    function test_FailedTransfer_ThenRetrySucceedsAfterUnblock() public {
        usdc.setBlocked(merchant, true);
        vm.prank(payer);
        vm.expectRevert();
        pay.pay(REF, merchant, AMT);
        usdc.setBlocked(merchant, false);
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        assertTrue(pay.isPaid(REF, merchant, AMT));
        assertEq(usdc.balanceOf(merchant), AMT);
    }

    // ---------------- griefing resistance ----------------

    function test_DifferentMerchant_DifferentIdAndNotBlocked() public {
        vm.prank(payer);
        pay.pay(REF, merchant2, AMT); // attacker-style altered terms
        assertNotEq(pay.paymentIdOf(REF, merchant, AMT), pay.paymentIdOf(REF, merchant2, AMT));
        assertFalse(pay.isPaid(REF, merchant, AMT));
        vm.prank(payer);
        pay.pay(REF, merchant, AMT); // genuine terms still payable
        assertTrue(pay.isPaid(REF, merchant, AMT));
        assertTrue(pay.isPaid(REF, merchant2, AMT));
    }

    function test_DifferentAmount_DifferentIdAndNotBlocked() public {
        vm.prank(payer);
        pay.pay(REF, merchant, 1); // dust payment with same ref + merchant
        assertNotEq(pay.paymentIdOf(REF, merchant, 1), pay.paymentIdOf(REF, merchant, AMT));
        assertFalse(pay.isPaid(REF, merchant, AMT));
        vm.prank(payer);
        pay.pay(REF, merchant, AMT);
        assertTrue(pay.isPaid(REF, merchant, AMT));
        assertEq(usdc.balanceOf(merchant), AMT + 1);
    }

    function test_DifferentInvoiceRef_NotBlocked() public {
        vm.startPrank(payer);
        pay.pay(REF, merchant, AMT);
        pay.pay(bytes32(uint256(2)), merchant, AMT);
        vm.stopPrank();
        assertEq(usdc.balanceOf(merchant), 2 * AMT);
    }

    // ---------------- native value ----------------

    function test_Revert_NativeValueToContract() public {
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        (bool ok,) = address(pay).call{value: 1 ether}("");
        assertFalse(ok, "plain send must revert");
        assertEq(address(pay).balance, 0);
    }

    function test_Revert_NativeValueWithUnknownCalldata() public {
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        (bool ok,) = address(pay).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(pay).balance, 0);
    }

    function test_Revert_NativeValueOnPay() public {
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        (bool ok,) = address(pay).call{value: 1}(abi.encodeCall(StarPayPayments.pay, (REF, merchant, AMT)));
        assertFalse(ok, "pay is non-payable");
        assertFalse(pay.isPaid(REF, merchant, AMT));
        assertEq(usdc.balanceOf(merchant), 0);
    }

    // ---------------- fuzz ----------------

    function _validMerchant(address m) internal view returns (bool) {
        return m != address(0) && m != address(pay) && m != address(usdc) && m != payer
            && m.code.length == 0;
    }

    function testFuzz_Pay_TransfersExactAmount(bytes32 ref, address m, uint256 amount) public {
        vm.assume(ref != bytes32(0));
        vm.assume(_validMerchant(m));
        amount = bound(amount, 1, 1_000_000e6);

        uint256 pBefore = usdc.balanceOf(payer);
        uint256 mBefore = usdc.balanceOf(m);

        bytes32 id = pay.paymentIdOf(ref, m, amount);
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentReceived(ref, m, payer, amount, id);
        vm.prank(payer);
        pay.pay(ref, m, amount);

        assertEq(usdc.balanceOf(payer), pBefore - amount);
        assertEq(usdc.balanceOf(m), mBefore + amount);
        assertEq(usdc.balanceOf(address(pay)), 0);
        assertTrue(pay.isPaid(ref, m, amount));
    }

    function testFuzz_AlteredTermsNeverBlockGenuine(
        bytes32 ref,
        address m1,
        address m2,
        uint256 a1,
        uint256 a2
    ) public {
        vm.assume(ref != bytes32(0));
        vm.assume(_validMerchant(m1) && _validMerchant(m2));
        a1 = bound(a1, 1, 100_000e6);
        a2 = bound(a2, 1, 100_000e6);
        vm.assume(m1 != m2 || a1 != a2);

        vm.prank(payer);
        pay.pay(ref, m2, a2);
        assertNotEq(pay.paymentIdOf(ref, m1, a1), pay.paymentIdOf(ref, m2, a2));
        assertFalse(pay.isPaid(ref, m1, a1));

        vm.prank(payer);
        pay.pay(ref, m1, a1);
        assertTrue(pay.isPaid(ref, m1, a1));
        assertTrue(pay.isPaid(ref, m2, a2));
    }

    function testFuzz_DuplicateAlwaysReverts(bytes32 ref, address m, uint256 amount) public {
        vm.assume(ref != bytes32(0));
        vm.assume(_validMerchant(m));
        amount = bound(amount, 1, 500_000e6);
        vm.prank(payer);
        pay.pay(ref, m, amount);
        uint256 bal = usdc.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(StarPayPayments.AlreadyPaid.selector, pay.paymentIdOf(ref, m, amount))
        );
        pay.pay(ref, m, amount);
        assertEq(usdc.balanceOf(payer), bal);
    }

    function testFuzz_InsufficientBalanceLeavesUnpaid(uint256 amount) public {
        uint256 bal = usdc.balanceOf(payer);
        amount = bound(amount, bal + 1, type(uint256).max);
        vm.prank(payer);
        vm.expectRevert();
        pay.pay(REF, merchant, amount);
        assertFalse(pay.isPaid(REF, merchant, amount));
        assertEq(usdc.balanceOf(payer), bal);
    }

    function testFuzz_PaymentIdInjective(bytes32 r1, address m1, uint256 a1, bytes32 r2, address m2, uint256 a2)
        public
        view
    {
        bool same = r1 == r2 && m1 == m2 && a1 == a2;
        assertEq(pay.paymentIdOf(r1, m1, a1) == pay.paymentIdOf(r2, m2, a2), same);
    }
}

/// Handler driving random payments; the router must never custody funds.
contract PayHandler is Test {
    StarPayPayments internal pay;
    MockUSDC internal usdc;
    address internal payer = address(0xBEEF);
    uint256 public totalPaid;
    address[3] internal merchants = [address(0xA001), address(0xA002), address(0xA003)];

    constructor(StarPayPayments _pay, MockUSDC _usdc) {
        pay = _pay;
        usdc = _usdc;
        usdc.mint(payer, type(uint128).max);
        vm.prank(payer);
        usdc.approve(address(pay), type(uint256).max);
    }

    function doPay(uint256 refSeed, uint256 mSeed, uint256 amount) external {
        bytes32 ref = bytes32(bound(refSeed, 1, 5));
        address m = merchants[mSeed % 3];
        amount = bound(amount, 1, 1_000e6);
        if (pay.isPaid(ref, m, amount)) return;
        vm.prank(payer);
        pay.pay(ref, m, amount);
        totalPaid += amount;
    }

    function merchantSum() external view returns (uint256 s) {
        for (uint256 i; i < 3; i++) s += usdc.balanceOf(merchants[i]);
    }
}

contract StarPayPaymentsInvariantTest is Test {
    StarPayPayments internal pay;
    MockUSDC internal usdc;
    PayHandler internal handler;

    function setUp() public {
        usdc = new MockUSDC();
        pay = new StarPayPayments(address(usdc));
        handler = new PayHandler(pay, usdc);
        targetContract(address(handler));
    }

    function invariant_RouterNeverHoldsUsdc() public view {
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function invariant_MerchantsReceiveExactlyWhatWasPaid() public view {
        assertEq(handler.merchantSum(), handler.totalPaid());
    }
}
