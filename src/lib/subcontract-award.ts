/**
 * Award a SubBid → generate a Subcontract with commitment rows.
 */

import { prisma } from "@/lib/prisma";
import { ContractStatus, ContractType, SubBidStatus } from "@prisma/client";

export async function awardSubBid(subBidId: string, tenantId: string): Promise<{ ok: boolean; contractId?: string; note: string }> {
  const bid = await prisma.subBid.findUnique({
    where: { id: subBidId },
    include: { bidPackage: { include: { project: true } }, vendor: true },
  });
  if (!bid) return { ok: false, note: "bid not found" };
  if (bid.bidPackage.project.tenantId !== tenantId) return { ok: false, note: "cross-tenant" };
  if (!bid.bidAmount) return { ok: false, note: "bid has no amount" };

  // Idempotency guard. The rest of this function creates an EXECUTED Contract
  // + ContractCommitment — real committed dollars with no unique key — so a
  // double-submit (or two concurrent requests) on the award button would
  // create a duplicate subcontract for the same winning bid. Atomically claim
  // the winning SubBid by flipping it to SELECTED only while it is still in a
  // pre-award status. The first request matches one row and proceeds; a second
  // matches zero (already SELECTED) and bails before any contract is created.
  const claim = await prisma.subBid.updateMany({
    where: { id: bid.id, status: { in: [SubBidStatus.SUBMITTED, SubBidStatus.BIDDING, SubBidStatus.INVITED] } },
    data: { status: SubBidStatus.SELECTED },
  });
  if (claim.count === 0) {
    return { ok: false, note: "this bid has already been awarded" };
  }

  // Mark losers NOT_SELECTED (the winner is already SELECTED via the claim).
  await prisma.subBid.updateMany({
    where: { bidPackageId: bid.bidPackageId, id: { not: bid.id }, status: { in: [SubBidStatus.SUBMITTED, SubBidStatus.BIDDING, SubBidStatus.INVITED] } },
    data: { status: SubBidStatus.NOT_SELECTED },
  });

  const contractNumber = `${bid.bidPackage.project.code}-SUB-${bid.bidPackage.trade.replace(/[^A-Z]/gi, "").slice(0, 4).toUpperCase()}-${bid.id.slice(-4).toUpperCase()}`;
  const contract = await prisma.contract.create({
    data: {
      projectId: bid.bidPackage.projectId,
      counterparty: bid.vendor.name,
      contractNumber,
      title: `${bid.vendor.name} — ${bid.bidPackage.name}`,
      type: ContractType.SUBCONTRACT,
      status: ContractStatus.EXECUTED,
      originalValue: bid.bidAmount,
      currentValue: bid.bidAmount,
      retainagePct: 10,
      executedAt: new Date(),
      notes: `Awarded from bid package ${bid.bidPackage.name}. Inclusions: ${bid.inclusions ?? "—"}. Exclusions: ${bid.exclusions ?? "—"}.`,
    },
  });
  await prisma.contractCommitment.create({
    data: {
      contractId: contract.id,
      costCode: bid.bidPackage.trade,
      description: `${bid.bidPackage.name} — scope per RFP`,
      committedAmount: bid.bidAmount,
    },
  });

  await prisma.bidPackage.update({
    where: { id: bid.bidPackageId },
    data: { status: "AWARDED" },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId,
      entityType: "Contract",
      entityId: contract.id,
      action: "AWARDED_FROM_SUBBID",
      afterJson: JSON.stringify({ subBidId: bid.id, vendorId: bid.vendor.id, amount: bid.bidAmount }),
      source: "subcontract-award",
    },
  });

  return { ok: true, contractId: contract.id, note: `Awarded subcontract ${contractNumber}` };
}
