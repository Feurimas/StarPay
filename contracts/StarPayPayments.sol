// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StarPayPayments
/// @notice Immutable, non-custodial USDC invoice payments for StarPay on Arc Testnet.
/// @dev Payments transfer directly from payer to merchant; this contract never takes
/// custody in the payment flow. There are no administrative or withdrawal functions.
/// No receive or fallback function is provided, so ordinary native-value calls revert.
/// Unsolicited token transfers or forcibly delivered native funds cannot be prevented
/// and cannot be recovered. Amounts use USDC base units (6 decimals on Arc).
/// Arc's USDC ERC-20 interface reverts on transfers involving the zero address or
/// blocklisted addresses. This contract relies on those reverts to fail safely.
contract StarPayPayments {
    using SafeERC20 for IERC20;

    /// @notice The constructor was given the zero address for USDC.
    error InvalidUSDC();

    /// @notice The invoice reference must not be zero.
    error InvalidInvoiceRef();

    /// @notice The merchant is zero, this contract, or the USDC contract.
    /// @param merchant The rejected merchant address.
    error InvalidMerchant(address merchant);

    /// @notice The payment amount must be greater than zero.
    error InvalidAmount();

    /// @notice These exact invoice terms have already been paid.
    /// @param paymentId The identifier of the previously paid terms.
    error AlreadyPaid(bytes32 paymentId);

    /// @notice A USDC payment transferred successfully from payer to merchant.
    /// @param invoiceRef The application's invoice reference.
    /// @param merchant The wallet receiving USDC directly.
    /// @param payer The caller whose USDC was transferred.
    /// @param amount The amount transferred in USDC base units.
    /// @param paymentId The hash committing to invoiceRef, merchant, and amount.
    event PaymentReceived(
        bytes32 indexed invoiceRef,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        bytes32 paymentId
    );

    /// @notice The immutable ERC-20 USDC interface supplied at deployment.
    IERC20 public immutable usdc;

    /// @notice Whether exact invoice terms have been paid, keyed by payment ID.
    /// @dev Entries persist only if the corresponding token transfer succeeds.
    mapping(bytes32 paymentId => bool) public paid;

    /// @notice Configure the USDC interface permanently.
    /// @dev The deployer must supply the correct token for the target chain.
    /// @param usdc_ The nonzero ERC-20 USDC interface address.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert InvalidUSDC();
        usdc = IERC20(usdc_);
    }

    /// @notice Pay exact invoice terms by transferring USDC directly to a merchant.
    /// @dev The caller must first approve this contract to spend at least amount.
    /// Marks the identifier before the external token call (checks-effects-interactions).
    /// Any transfer failure reverts the entire call, including the paid marker.
    /// Different merchant or amount terms produce a different identifier, preventing
    /// payments with altered terms from blocking the genuine invoice terms.
    /// This records payment terms, not the authenticity of an off-chain invoice;
    /// verifiers must compare the event with their independently stored invoice.
    /// @param invoiceRef The nonzero application invoice reference.
    /// @param merchant The recipient, excluding zero, this contract, and USDC itself.
    /// @param amount The positive amount in USDC base units.
    function pay(bytes32 invoiceRef, address merchant, uint256 amount) external {
        if (invoiceRef == bytes32(0)) revert InvalidInvoiceRef();
        if (
            merchant == address(0) || merchant == address(this) || merchant == address(usdc)
        ) revert InvalidMerchant(merchant);
        if (amount == 0) revert InvalidAmount();

        bytes32 paymentId = paymentIdOf(invoiceRef, merchant, amount);
        if (paid[paymentId]) revert AlreadyPaid(paymentId);

        paid[paymentId] = true;
        usdc.safeTransferFrom(msg.sender, merchant, amount);

        emit PaymentReceived(invoiceRef, merchant, msg.sender, amount, paymentId);
    }

    /// @notice Compute the identifier committing to exact invoice terms.
    /// @dev Uses abi.encode, not packed encoding; does not validate the terms.
    /// @param invoiceRef The application's invoice reference.
    /// @param merchant The intended recipient wallet.
    /// @param amount The amount in USDC base units.
    /// @return paymentId The keccak256 hash of the ABI-encoded terms.
    function paymentIdOf(bytes32 invoiceRef, address merchant, uint256 amount)
        public
        pure
        returns (bytes32 paymentId)
    {
        return keccak256(abi.encode(invoiceRef, merchant, amount));
    }

    /// @notice Check whether exact invoice terms have been paid.
    /// @param invoiceRef The application's invoice reference.
    /// @param merchant The intended recipient wallet.
    /// @param amount The amount in USDC base units.
    /// @return True if a payment for these exact terms succeeded.
    function isPaid(bytes32 invoiceRef, address merchant, uint256 amount)
        external
        view
        returns (bool)
    {
        return paid[paymentIdOf(invoiceRef, merchant, amount)];
    }
}
