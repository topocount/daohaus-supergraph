import { BigInt, log, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  SummonComplete,
  SubmitProposal,
  SubmitVote,
  ProcessProposal,
  UpdateDelegateKey,
  SponsorProposal,
  ProcessWhitelistProposal,
  ProcessGuildKickProposal,
  Ragequit,
  CancelProposal,
  Withdraw,
  TokensCollected,
} from "../generated/templates/MolochV2Template/V2Moloch";
import { Erc20 } from "../generated/templates/MolochV2Template/Erc20";
import { Erc20Bytes32 } from "../generated/templates/MolochV2Template/Erc20Bytes32";

import {
  Moloch,
  Member,
  Token,
  TokenBalance,
  Proposal,
  Vote,
  RageQuit,
  DaoMeta,
} from "../generated/schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
let ESCROW = Address.fromString("0x000000000000000000000000000000000000beef");
let GUILD = Address.fromString("0x000000000000000000000000000000000000dead");

function loadOrCreateTokenBalance(
  molochId: string,
  member: Bytes,
  token: string
): TokenBalance | null {
  let memberTokenBalanceId = token.concat("-member-").concat(member.toHex());
  let tokenBalance = TokenBalance.load(memberTokenBalanceId);
  let tokenBalanceDNE = tokenBalance == null ? true : false;
  if (tokenBalanceDNE) {
    createMemberTokenBalance(molochId, member, token, BigInt.fromI32(0));
    return TokenBalance.load(memberTokenBalanceId);
  } else {
    return tokenBalance;
  }
}
function addToBalance(
  molochId: string,
  member: Bytes,
  token: string,
  amount: BigInt
): string {
  let tokenBalanceId = token.concat("-member-").concat(member.toHex());
  let balance: TokenBalance | null = loadOrCreateTokenBalance(
    molochId,
    member,
    token
  );
  balance.tokenBalance = balance.tokenBalance.plus(amount);
  balance.save();
  return tokenBalanceId;
}
function subtractFromBalance(
  molochId: string,
  member: Bytes,
  token: string,
  amount: BigInt
): string {
  let tokenBalanceId = token.concat("-member-").concat(member.toHex());
  let balance: TokenBalance | null = loadOrCreateTokenBalance(
    molochId,
    member,
    token
  );
  balance.tokenBalance = balance.tokenBalance.minus(amount);
  balance.save();
  return tokenBalanceId;
}

function internalTransfer(
  molochId: string,
  from: Bytes,
  to: Bytes,
  token: string,
  amount: BigInt
): void {
  subtractFromBalance(molochId, from, token, amount);
  addToBalance(molochId, to, token, amount);
}

export function createMemberTokenBalance(
  molochId: string,
  member: Bytes,
  token: string,
  amount: BigInt
): string {
  let memberId = molochId.concat("-member-").concat(member.toHex());
  let memberTokenBalanceId = token.concat("-member-").concat(member.toHex());
  let memberTokenBalance = new TokenBalance(memberTokenBalanceId);

  memberTokenBalance.moloch = molochId;
  memberTokenBalance.token = token;
  memberTokenBalance.tokenBalance = amount;
  memberTokenBalance.member = memberId;
  memberTokenBalance.guildBank = false;
  memberTokenBalance.ecrowBank = false;
  memberTokenBalance.memberBank = true;

  memberTokenBalance.save();
  return memberTokenBalanceId;
}

export function createEscrowTokenBalance(
  molochId: string,
  token: Bytes
): string {
  let memberId = molochId.concat("-member-").concat(ESCROW.toHex());
  let tokenId = molochId.concat("-token-").concat(token.toHex());
  let escrowTokenBalanceId = tokenId.concat("-member-").concat(ESCROW.toHex());
  let escrowTokenBalance = new TokenBalance(escrowTokenBalanceId);
  escrowTokenBalance.moloch = molochId;
  escrowTokenBalance.token = tokenId;
  escrowTokenBalance.tokenBalance = BigInt.fromI32(0);
  escrowTokenBalance.member = memberId;
  escrowTokenBalance.guildBank = false;
  escrowTokenBalance.ecrowBank = true;
  escrowTokenBalance.memberBank = false;

  escrowTokenBalance.save();
  return escrowTokenBalanceId;
}

export function createGuildTokenBalance(
  molochId: string,
  token: Bytes
): string {
  let memberId = molochId.concat("-member-").concat(GUILD.toHex());
  let tokenId = molochId.concat("-token-").concat(token.toHex());
  let guildTokenBalanceId = tokenId.concat("-member-").concat(GUILD.toHex());
  let guildTokenBalance = new TokenBalance(guildTokenBalanceId);

  guildTokenBalance.moloch = molochId;
  guildTokenBalance.token = tokenId;
  guildTokenBalance.tokenBalance = BigInt.fromI32(0);
  guildTokenBalance.member = memberId;
  guildTokenBalance.guildBank = true;
  guildTokenBalance.ecrowBank = false;
  guildTokenBalance.memberBank = false;

  guildTokenBalance.save();
  return guildTokenBalanceId;
}
export function createAndApproveToken(molochId: string, token: Bytes): string {
  let tokenId = molochId.concat("-token-").concat(token.toHex());
  let createToken = new Token(tokenId);

  createToken.moloch = molochId;
  createToken.tokenAddress = token;
  createToken.whitelisted = true;

  let erc20 = Erc20.bind(token as Address);
  let symbol = erc20.try_symbol();
  if (symbol.reverted) {
    let erc20Bytes32 = Erc20Bytes32.bind(token as Address);
    let otherSymbol = erc20Bytes32.try_symbol();
    if (otherSymbol.reverted) {
      log.info("other symbol reverted molochId {}, token, {}", [
        molochId,
        token.toHexString(),
      ]);
    } else {
      createToken.symbol = otherSymbol.value.toString();
    }
  } else {
    createToken.symbol = symbol.value;
  }

  let decimals = erc20.try_decimals();
  if (decimals.reverted) {
    log.info("decimals reverted molochId {}, token, {}", [
      molochId,
      token.toHexString(),
    ]);
  } else {
    createToken.decimals = BigInt.fromI32(decimals.value);
  }

  createToken.save();
  return tokenId;
}

//legacy daos will trigger this, factory daos get created in factory-mapping.ts
export function handleSummonComplete(event: SummonComplete): void {
  let molochId = event.address.toHex();
  let moloch = new Moloch(molochId);
  let daoMeta = DaoMeta.load(molochId);

  let tokens = event.params.tokens;
  let approvedTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    approvedTokens.push(createAndApproveToken(molochId, token));
    createEscrowTokenBalance(molochId, token);
    createGuildTokenBalance(molochId, token);
  }

  moloch.summoner = event.params.summoner;
  moloch.summoningTime = event.params.summoningTime;
  moloch.title = daoMeta.title;
  moloch.version = daoMeta.version;
  moloch.newContract = daoMeta.newContract;
  moloch.deleted = false;
  moloch.periodDuration = event.params.periodDuration;
  moloch.votingPeriodLength = event.params.votingPeriodLength;
  moloch.gracePeriodLength = event.params.gracePeriodLength;
  moloch.proposalDeposit = event.params.proposalDeposit;
  moloch.dilutionBound = event.params.dilutionBound;
  moloch.processingReward = event.params.processingReward;
  moloch.depositToken = approvedTokens[0];
  moloch.approvedTokens = approvedTokens;
  moloch.totalShares = BigInt.fromI32(1);
  moloch.totalLoot = BigInt.fromI32(0);

  moloch.save();

  let memberId = molochId
    .concat("-member-")
    .concat(event.params.summoner.toHex());
  let newMember = new Member(memberId);
  newMember.moloch = molochId;
  newMember.molochAddress = event.address;
  newMember.memberAddress = event.params.summoner;
  newMember.createdAt = event.block.timestamp.toString();
  newMember.delegateKey = event.params.summoner;
  newMember.shares = BigInt.fromI32(1);
  newMember.loot = BigInt.fromI32(0);
  newMember.exists = true;
  newMember.tokenTribute = BigInt.fromI32(0);
  newMember.didRagequit = false;
  newMember.proposedToKick = false;
  newMember.kicked = false;

  newMember.save();

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    let tokenId = molochId.concat("-token-").concat(token.toHex());
    createMemberTokenBalance(
      molochId,
      event.params.summoner,
      tokenId,
      BigInt.fromI32(0)
    );
  }
}

export function handleSubmitProposal(event: SubmitProposal): void {
  let molochId = event.address.toHexString();

  let newProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let memberId = molochId
    .concat("-member-")
    .concat(event.params.memberAddress.toHex());

  let member = Member.load(
    molochId.concat("-member-").concat(event.params.applicant.toHex())
  );
  let noMember = member == null || member.exists == false;
  let requestingSharesOrLoot =
    event.params.sharesRequested > BigInt.fromI32(0) ||
    event.params.lootRequested > BigInt.fromI32(0);
  let newMember = noMember && requestingSharesOrLoot;

  let trade =
    event.params.paymentToken != Address.fromI32(0) &&
    event.params.tributeToken != Address.fromI32(0) &&
    event.params.tributeOffered > BigInt.fromI32(0) &&
    event.params.paymentRequested > BigInt.fromI32(0);

  let flags = event.params.flags;

  let proposal = new Proposal(newProposalId);
  proposal.proposalId = event.params.proposalId;
  proposal.moloch = molochId;
  proposal.molochAddress = event.address;
  proposal.createdAt = event.block.timestamp.toString();
  proposal.member = memberId;
  proposal.memberAddress = event.params.memberAddress;
  proposal.delegateKey = event.params.delegateKey;
  proposal.applicant = event.params.applicant;
  proposal.proposer = event.transaction.from;
  proposal.sponsor = Address.fromString(ZERO_ADDRESS);
  proposal.sharesRequested = event.params.sharesRequested;
  proposal.lootRequested = event.params.lootRequested;
  proposal.tributeOffered = event.params.tributeOffered;
  proposal.tributeToken = event.params.tributeToken;
  proposal.paymentRequested = event.params.paymentRequested;
  proposal.paymentToken = event.params.paymentToken;
  proposal.startingPeriod = BigInt.fromI32(0);
  proposal.yesVotes = BigInt.fromI32(0);
  proposal.noVotes = BigInt.fromI32(0);
  proposal.sponsored = flags[0];
  proposal.processed = flags[1];
  proposal.didPass = flags[2];
  proposal.cancelled = flags[3];
  proposal.whitelist = flags[4];
  proposal.guildkick = flags[5];
  proposal.newMember = newMember;
  proposal.trade = trade;
  proposal.yesShares = BigInt.fromI32(0);
  proposal.noShares = BigInt.fromI32(0);
  proposal.maxTotalSharesAndLootAtYesVote = BigInt.fromI32(0);
  proposal.molochVersion = "2";
  proposal.votingPeriodStarts = BigInt.fromI32(0);
  proposal.votingPeriodEnds = BigInt.fromI32(0);
  proposal.gracePeriodEnds = BigInt.fromI32(0);
  proposal.details = event.params.details.toString();

  if (event.params.tributeOffered > BigInt.fromI32(0)) {
    let tokenId = molochId
      .concat("-token-")
      .concat(event.params.tributeToken.toHex());
    let token = Token.load(tokenId);
    proposal.tributeTokenSymbol = token.symbol;
    proposal.tributeTokenDecimals = token.decimals;
  }

  if (event.params.paymentRequested > BigInt.fromI32(0)) {
    let tokenId = molochId
      .concat("-token-")
      .concat(event.params.paymentToken.toHex());
    let token = Token.load(tokenId);
    proposal.paymentTokenSymbol = token.symbol;
    proposal.paymentTokenDecimals = token.decimals;
  }

  proposal.save();

  if (event.params.tributeOffered > BigInt.fromI32(0)) {
    let tokenId = molochId
      .concat("-token-")
      .concat(event.params.tributeToken.toHex());
    addToBalance(molochId, ESCROW, tokenId, event.params.tributeOffered);
  }
}

export function handleSubmitVote(event: SubmitVote): void {
  let molochId = event.address.toHexString();
  let memberId = molochId
    .concat("-member-")
    .concat(event.params.memberAddress.toHex());
  let proposalVotedId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let voteId = memberId
    .concat("-vote-")
    .concat(event.params.proposalId.toString());

  let vote = new Vote(voteId);

  vote.createdAt = event.block.timestamp.toString();
  vote.proposal = proposalVotedId;
  vote.member = memberId;
  vote.memberAddress = event.params.memberAddress;
  vote.molochAddress = event.address;
  vote.uintVote = event.params.uintVote;

  vote.save();

  let moloch = Moloch.load(molochId);
  let proposal = Proposal.load(proposalVotedId);
  let member = Member.load(memberId);

  switch (event.params.uintVote) {
    case 1: {
      proposal.yesShares = proposal.yesShares.plus(member.shares);
      proposal.yesVotes = proposal.yesVotes.plus(BigInt.fromI32(1));
      proposal.maxTotalSharesAndLootAtYesVote = moloch.totalLoot.plus(
        moloch.totalShares
      );
      member.highestIndexYesVote = proposalVotedId;
      proposal.save();
      member.save();
      break;
    }
    case 2: {
      proposal.noShares = proposal.noShares.plus(member.shares);
      proposal.noVotes = proposal.noVotes.plus(BigInt.fromI32(1));
      proposal.save();
      break;
    }
    default: {
      log.info(
        "handleSubmitVote: ERROR, SHOULD BE A DEAD END CHECK uintVote INVARIANT IN CONTRACT",
        []
      );
      break;
    }
  }
}

export function handleSponsorProposal(event: SponsorProposal): void {
  let molochId = event.address.toHexString();
  let memberId = molochId
    .concat("-member-")
    .concat(event.params.memberAddress.toHex());
  let sponsorProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let moloch = Moloch.load(molochId);

  addToBalance(molochId, ESCROW, moloch.depositToken, moloch.proposalDeposit);

  let proposal = Proposal.load(sponsorProposalId);

  if (proposal.guildkick) {
    let member = Member.load(memberId);
    member.proposedToKick = true;
    member.save();
  }

  proposal.proposalIndex = event.params.proposalIndex;
  proposal.sponsor = event.params.memberAddress;
  proposal.sponsoredAt = event.block.timestamp.toString();
  proposal.startingPeriod = event.params.startingPeriod;
  proposal.sponsored = true;

  let votingPeriodStarts = moloch.summoningTime.plus(
    proposal.startingPeriod.times(moloch.periodDuration)
  );
  let votingPeriodEnds = votingPeriodStarts.plus(
    moloch.votingPeriodLength.times(moloch.periodDuration)
  );
  let gracePeriodEnds = votingPeriodEnds.plus(
    moloch.gracePeriodLength.times(moloch.periodDuration)
  );

  proposal.votingPeriodStarts = votingPeriodStarts;
  proposal.votingPeriodEnds = votingPeriodEnds;
  proposal.gracePeriodEnds = gracePeriodEnds;

  proposal.save();
}

export function handleProcessProposal(event: ProcessProposal): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);

  let processProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposal.load(processProposalId);

  let applicantId = molochId
    .concat("-member-")
    .concat(proposal.applicant.toHex());
  let member = Member.load(applicantId);

  let tributeTokenId = molochId
    .concat("-token-")
    .concat(proposal.tributeToken.toHex());
  let paymentTokenId = molochId
    .concat("-token-")
    .concat(proposal.paymentToken.toHex());

  let isNewMember = member != null && member.exists == true ? false : true;

  if (event.params.didPass) {
    proposal.didPass = true;

    if (isNewMember) {
      let newMember = member;

      if (newMember == null) {
        newMember = new Member(applicantId);
      }

      newMember.moloch = molochId;
      newMember.createdAt = event.block.timestamp.toString();
      newMember.molochAddress = event.address;
      newMember.memberAddress = proposal.applicant;
      newMember.delegateKey = proposal.applicant;
      newMember.shares = proposal.sharesRequested;
      newMember.loot = proposal.lootRequested;

      let sharesOrLootRequested =
        proposal.sharesRequested > BigInt.fromI32(0) ||
        proposal.lootRequested > BigInt.fromI32(0);

      if (sharesOrLootRequested) {
        newMember.exists = true;
      } else {
        newMember.exists = false;
      }

      newMember.tokenTribute = BigInt.fromI32(0);
      newMember.didRagequit = false;
      newMember.proposedToKick = false;
      newMember.kicked = false;

      newMember.save();
    } else {
      member.shares = member.shares.plus(proposal.sharesRequested);
      member.loot = member.loot.plus(proposal.lootRequested);
      member.save();
    }

    moloch.totalShares = moloch.totalShares.plus(proposal.sharesRequested);
    moloch.totalLoot = moloch.totalLoot.plus(proposal.lootRequested);
    internalTransfer(
      molochId,
      ESCROW,
      GUILD,
      tributeTokenId,
      proposal.tributeOffered
    );
    internalTransfer(
      molochId,
      GUILD,
      proposal.applicant,
      paymentTokenId,
      proposal.paymentRequested
    );
  } else {
    proposal.didPass = false;
    if (isNewMember) {
      let newMember = new Member(applicantId);

      newMember.moloch = molochId;
      newMember.createdAt = event.block.timestamp.toString();
      newMember.molochAddress = event.address;
      newMember.memberAddress = proposal.applicant;
      newMember.delegateKey = proposal.applicant;
      newMember.shares = BigInt.fromI32(0);
      newMember.loot = BigInt.fromI32(0);
      newMember.exists = false;
      newMember.tokenTribute = BigInt.fromI32(0);
      newMember.didRagequit = false;
      newMember.proposedToKick = false;
      newMember.kicked = false;

      newMember.save();
    }

    internalTransfer(
      molochId,
      ESCROW,
      proposal.applicant,
      tributeTokenId,
      proposal.tributeOffered
    );
  }

  proposal.processed = true;

  internalTransfer(
    molochId,
    ESCROW,
    event.transaction.from,
    moloch.depositToken,
    moloch.processingReward
  );
  internalTransfer(
    molochId,
    ESCROW,
    proposal.sponsor,
    moloch.depositToken,
    moloch.proposalDeposit.minus(moloch.processingReward)
  );

  moloch.save();
  proposal.save();
}

export function handleProcessWhitelistProposal(
  event: ProcessWhitelistProposal
): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);

  let processProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposal.load(processProposalId);

  let tokenId = molochId
    .concat("-token-")
    .concat(proposal.tributeToken.toHex());

  let token = Token.load(tokenId);

  let isNotWhitelisted =
    token != null && token.whitelisted == true ? false : true;

  if (event.params.didPass) {
    proposal.didPass = true;

    if (isNotWhitelisted) {
      let approvedTokens = moloch.approvedTokens;
      approvedTokens.push(
        createAndApproveToken(molochId, proposal.tributeToken)
      );
      moloch.approvedTokens = approvedTokens;

      createGuildTokenBalance(molochId, proposal.tributeToken);
      createEscrowTokenBalance(molochId, proposal.tributeToken);
    }
  } else {
    proposal.didPass = false;
  }
  proposal.processed = true;

  internalTransfer(
    molochId,
    ESCROW,
    event.transaction.from,
    moloch.depositToken,
    moloch.processingReward
  );
  internalTransfer(
    molochId,
    ESCROW,
    proposal.sponsor,
    moloch.depositToken,
    moloch.proposalDeposit.minus(moloch.processingReward)
  );

  moloch.save();
  proposal.save();
}

export function handleProcessGuildKickProposal(
  event: ProcessGuildKickProposal
): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);

  let processProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposal.load(processProposalId);

  if (event.params.didPass) {
    proposal.didPass = true;
    if (proposal.guildkick) {
      let memberId = molochId
        .concat("-member-")
        .concat(proposal.applicant.toHexString());
      let member = Member.load(memberId);
      let newLoot = member.shares;
      member.jailed = processProposalId;
      member.kicked = true;
      member.shares = BigInt.fromI32(0);
      member.loot = member.loot.plus(newLoot);
      moloch.totalLoot = moloch.totalLoot.plus(newLoot);
      moloch.totalShares = moloch.totalShares.minus(newLoot);

      member.save();
    }
  } else {
    proposal.didPass = false;
  }
  proposal.processed = true;

  internalTransfer(
    molochId,
    ESCROW,
    event.transaction.from,
    moloch.depositToken,
    moloch.processingReward
  );
  internalTransfer(
    molochId,
    ESCROW,
    proposal.sponsor,
    moloch.depositToken,
    moloch.proposalDeposit.minus(moloch.processingReward)
  );

  moloch.save();
  proposal.save();
}

export function handleRagequit(event: Ragequit): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);

  let memberId = molochId
    .concat("-member-")
    .concat(event.params.memberAddress.toHex());
  let member = Member.load(memberId);

  let sharesAndLootToBurn = event.params.sharesToBurn.plus(
    event.params.lootToBurn
  );
  let initialTotalSharesAndLoot = moloch.totalShares.plus(moloch.totalLoot);

  member.shares = member.shares.minus(event.params.sharesToBurn);
  member.loot = member.loot.minus(event.params.lootToBurn);
  moloch.totalShares = moloch.totalShares.minus(event.params.sharesToBurn);
  moloch.totalLoot = moloch.totalLoot.minus(event.params.lootToBurn);

  let noSharesOrLoot =
    member.shares.equals(new BigInt(0)) && member.loot.equals(new BigInt(0));
  if (noSharesOrLoot) {
    member.exists = false;
  }

  let tokens = moloch.approvedTokens;
  for (let i = 0; i < tokens.length; i++) {
    let token: string = tokens[i];

    let balance: TokenBalance | null = loadOrCreateTokenBalance(
      molochId,
      GUILD,
      token
    );

    let balanceTimesBurn = balance.tokenBalance.times(sharesAndLootToBurn);
    let amountToRageQuit = balanceTimesBurn.div(initialTotalSharesAndLoot);

    internalTransfer(
      molochId,
      GUILD,
      member.memberAddress,
      token,
      amountToRageQuit
    );
  }

  member.save();
  moloch.save();

  let rageQuitId = memberId
    .concat("-")
    .concat("rage-")
    .concat(event.block.number.toString());
  let rageQuit = new RageQuit(rageQuitId);
  rageQuit.createdAt = event.block.timestamp.toString();
  rageQuit.moloch = molochId;
  rageQuit.molochAddress = event.address;
  rageQuit.member = memberId;
  rageQuit.memberAddress = event.params.memberAddress;
  rageQuit.shares = event.params.sharesToBurn;
  rageQuit.loot = event.params.lootToBurn;

  rageQuit.save();
}

export function handleCancelProposal(event: CancelProposal): void {
  let molochId = event.address.toHexString();
  let processProposalId = molochId
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposal.load(processProposalId);

  if (proposal.tributeOffered > BigInt.fromI32(0)) {
    let applicantId = molochId
      .concat("-member-")
      .concat(proposal.applicant.toHex());
    let member = Member.load(applicantId);

    if (member == null) {
      let newMember = new Member(applicantId);

      newMember.moloch = molochId;
      newMember.createdAt = event.block.timestamp.toString();
      newMember.molochAddress = event.address;
      newMember.memberAddress = proposal.applicant;
      newMember.delegateKey = proposal.applicant;
      newMember.shares = BigInt.fromI32(0);
      newMember.loot = proposal.lootRequested;
      newMember.exists = false;
      newMember.tokenTribute = BigInt.fromI32(0);
      newMember.didRagequit = false;
      newMember.proposedToKick = false;
      newMember.kicked = false;

      newMember.save();
    }

    let tokenId = molochId
      .concat("-token-")
      .concat(proposal.tributeToken.toHex());

    internalTransfer(
      molochId,
      ESCROW,
      proposal.applicant,
      tokenId,
      proposal.tributeOffered
    );
  }

  proposal.cancelled = true;
  proposal.save();
}

export function handleUpdateDelegateKey(event: UpdateDelegateKey): void {
  let molochId = event.address.toHexString();
  let memberId = molochId
    .concat("-member-")
    .concat(event.params.memberAddress.toHex());
  let member = Member.load(memberId);
  member.delegateKey = event.params.newDelegateKey;
  member.save();
}

export function handleWithdraw(event: Withdraw): void {
  let molochId = event.address.toHexString();

  let tokenId = molochId.concat("-token-").concat(event.params.token.toHex());

  if (event.params.amount > BigInt.fromI32(0)) {
    subtractFromBalance(
      molochId,
      event.params.memberAddress,
      tokenId,
      event.params.amount
    );
  }
}

export function handleTokensCollected(event: TokensCollected): void {
  let molochId = event.address.toHexString();
  let tokenId = molochId.concat("-token-").concat(event.params.token.toHex());

  addToBalance(molochId, GUILD, tokenId, event.params.amountToCollect);
}
