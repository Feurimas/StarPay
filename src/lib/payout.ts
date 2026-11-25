/** The exact text a merchant signs to prove they control the wallet that will receive their payments. */
export const payoutMessage = (workspaceId: string, address: string, issuedAt: string) =>
  `StarPay payout wallet\nWorkspace: ${workspaceId}\nAddress: ${address}\nIssued: ${issuedAt}`
