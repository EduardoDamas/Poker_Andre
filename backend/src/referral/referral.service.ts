import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Agent, Prisma, Subscription, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  commissionCents,
  isValidReferralCode,
  MEMBER_COMMISSION_PCT,
  normalizeReferralCode,
  suggestReferralCode,
} from './referral';

/** BigInt-free view of an agent, with their totals. */
export interface AgentSummary {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  commissionPct: number | null;
  active: boolean;
  createdAt: Date;
  players: number;
  /** Referred players who have paid at least one plan. */
  subscribers: number;
  baseCents: string;
  commissionCents: string | null;
}

/** One referred player in an agent's report. */
export interface ReferredPlayer {
  userId: string;
  displayName: string;
  phone: string;
  linkedAt: Date | null;
  subscription: string;
  firstSubscription: { plan: string; amountCents: string; at: Date } | null;
  firstDeposit: { amountCents: string; at: Date; via: 'PIX' | 'CARTAO' } | null;
  /** First subscription + first deposit — what the commission is paid on. */
  baseCents: string;
  commissionCents: string | null;
}

export interface AgentReport extends AgentSummary {
  referred: ReferredPlayer[];
}

/** A player who invited friends with their own code, with the totals. */
export interface MemberReferrer {
  userId: string;
  displayName: string;
  phone: string;
  code: string | null;
  invited: number;
  /** Friends who bought a plan — the only ones that pay a commission. */
  subscribers: number;
  commissionCents: string;
}

/** One friend in a member's report. */
export interface MemberReferral {
  userId: string;
  displayName: string;
  phone: string;
  referredAt: Date | null;
  subscription: string;
  firstSubscription: { plan: string; amountCents: string; at: Date } | null;
  /** What they actually paid for their first paid tournament (refunded ones don't count). */
  firstEntry: { amountCents: string; at: Date } | null;
  /** By the plan of the first subscription: 5 / 10 / 15 / 20 %. */
  pct: number;
  baseCents: string;
  commissionCents: string;
}

export interface MemberReport extends MemberReferrer {
  referred: MemberReferral[];
}

/** Who a typed code belongs to: an agent, or another player. */
export type CodeOwner = { agent: Agent } | { referrer: Pick<User, 'id' | 'displayName'> };

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active agent behind a typed code, or null. */
  async agentByCode(raw: string): Promise<Agent | null> {
    const code = normalizeReferralCode(raw);
    if (!isValidReferralCode(code)) return null;
    const agent = await this.prisma.agent.findUnique({ where: { code } });
    return agent?.active ? agent : null;
  }

  /** The agent (active) or the player behind a typed code, or null. */
  async resolveCode(raw: string): Promise<CodeOwner | null> {
    const code = normalizeReferralCode(raw);
    if (!isValidReferralCode(code)) return null;
    const agent = await this.agentByCode(code);
    if (agent) return { agent };
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, displayName: true },
    });
    return referrer ? { referrer } : null;
  }

  /**
   * The player's own code to invite friends, made the first time they ask for
   * it (from their first name, e.g. MARIA47), and how many have signed up with it.
   */
  async myCode(userId: string): Promise<{ code: string; invited: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Jogador não encontrado.');
    let code = user.referralCode;
    for (let i = 0; !code && i < 50; i++) {
      const candidate = suggestReferralCode(user.displayName, randomInt(100));
      if (await this.codeTaken(candidate)) continue;
      try {
        // Only if they still have none (a parallel request may have made one).
        const set = await this.prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: candidate },
        });
        code = set.count === 1 ? candidate : ((await this.prisma.user.findUnique({ where: { id: userId } }))?.referralCode ?? null);
      } catch (err) {
        // Someone took that code a moment ago — or this player got one in a
        // parallel request: use theirs.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err;
        code = (await this.prisma.user.findUnique({ where: { id: userId } }))?.referralCode ?? null;
      }
    }
    if (!code) throw new ConflictException('Não foi possível criar seu código agora. Tente de novo.');
    const invited = await this.prisma.user.count({ where: { referredById: userId } });
    return { code, invited };
  }

  /** An agent's or a player's — the two share one set of codes. */
  private async codeTaken(code: string): Promise<boolean> {
    const [agent, user] = await Promise.all([
      this.prisma.agent.findUnique({ where: { code } }),
      this.prisma.user.findUnique({ where: { referralCode: code } }),
    ]);
    return Boolean(agent || user);
  }

  async create(input: { name: string; code?: string; phone?: string; commissionPct?: number | null }): Promise<AgentSummary> {
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('Informe o nome do agente.');
    let code: string;
    if (input.code?.trim()) {
      code = normalizeReferralCode(input.code);
      if (!isValidReferralCode(code)) {
        throw new BadRequestException('Código: de 3 a 20 letras ou números, sem acentos.');
      }
      if (await this.codeTaken(code)) {
        throw new ConflictException(`O código ${code} já está em uso.`);
      }
    } else {
      code = await this.freeSuggestedCode(name);
    }
    try {
      const agent = await this.prisma.agent.create({
        data: { name, code, phone: input.phone?.trim() || null, commissionPct: input.commissionPct ?? null },
      });
      return (await this.summaries([agent]))[0];
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`O código ${code} já é de outro agente.`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    input: { name?: string; phone?: string | null; commissionPct?: number | null; active?: boolean },
  ): Promise<AgentSummary> {
    await this.agentOr404(id);
    const agent = await this.prisma.agent.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.commissionPct !== undefined ? { commissionPct: input.commissionPct } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    return (await this.summaries([agent]))[0];
  }

  async list(): Promise<AgentSummary[]> {
    const agents = await this.prisma.agent.findMany({ orderBy: { createdAt: 'asc' } });
    return this.summaries(agents);
  }

  async report(id: string): Promise<AgentReport> {
    const agent = await this.agentOr404(id);
    const referred = await this.referredOf([agent.id]);
    return { ...this.summarize(agent, referred.get(agent.id) ?? []), referred: referred.get(agent.id) ?? [] };
  }

  /**
   * Link a player to the agent or player behind [code], or unlink with null —
   * for those who signed up without typing it, or typed the wrong one. A
   * player has one or the other, never both.
   */
  async link(
    userId: string,
    code: string | null,
  ): Promise<{ agentId: string | null; referredById: string | null; code: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Jogador não encontrado.');
    const none = { agentId: null, agentLinkedAt: null, referredById: null, referredAt: null };
    if (code === null || code.trim() === '') {
      await this.prisma.user.update({ where: { id: userId }, data: none });
      return { agentId: null, referredById: null, code: null };
    }
    const normalized = normalizeReferralCode(code);
    // An inactive agent's code still links by hand (the admin decides).
    const agent = await this.prisma.agent.findUnique({ where: { code: normalized } });
    if (agent) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { ...none, agentId: agent.id, agentLinkedAt: user.agentId === agent.id ? user.agentLinkedAt : new Date() },
      });
      return { agentId: agent.id, referredById: null, code: agent.code };
    }
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: normalized } });
    if (!referrer) throw new BadRequestException('Código de indicação inválido.');
    if (referrer.id === userId) throw new BadRequestException('O jogador não pode indicar a si mesmo.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...none, referredById: referrer.id, referredAt: user.referredById === referrer.id ? user.referredAt : new Date() },
    });
    return { agentId: null, referredById: referrer.id, code: normalized };
  }

  // --- Member referrals: who invited whom, and what each has earned ---

  /** Every player who has invited someone, most commission first. */
  async memberReferrers(): Promise<MemberReferrer[]> {
    const referrers = await this.prisma.user.findMany({ where: { referred: { some: {} } } });
    const rows = await this.memberRows(referrers.map((r) => r.id));
    return referrers
      .map((r) => this.summarizeMember(r, rows.get(r.id) ?? []))
      .sort((a, b) => Number(BigInt(b.commissionCents) - BigInt(a.commissionCents)) || b.invited - a.invited);
  }

  async memberReport(userId: string): Promise<MemberReport> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Jogador não encontrado.');
    const rows = (await this.memberRows([userId])).get(userId) ?? [];
    return { ...this.summarizeMember(user, rows), referred: rows };
  }

  private summarizeMember(u: User, rows: MemberReferral[]): MemberReferrer {
    return {
      userId: u.id,
      displayName: u.displayName,
      phone: u.phone,
      code: u.referralCode,
      invited: rows.length,
      subscribers: rows.filter((r) => r.firstSubscription).length,
      commissionCents: rows.reduce((sum, r) => sum + BigInt(r.commissionCents), 0n).toString(),
    };
  }

  /**
   * Each referrer's friends with their FIRST confirmed subscription and FIRST
   * paid tournament entry. The commission is a share of both, by the plan of
   * that first subscription (client, 2026-10-14) — renewals, later entries and
   * friends with no plan earn nothing. An entry given back (the room never
   * started) doesn't count: the ledger marks those references "#refunded-".
   */
  private async memberRows(referrerIds: string[]): Promise<Map<string, MemberReferral[]>> {
    const out = new Map<string, MemberReferral[]>();
    if (referrerIds.length === 0) return out;
    const friends = await this.prisma.user.findMany({
      where: { referredById: { in: referrerIds } },
      orderBy: { createdAt: 'asc' },
      include: {
        subscriptionRequests: { where: { status: 'CONFIRMED' }, orderBy: { settledAt: 'asc' }, take: 1 },
        account: true,
      },
    });
    for (const f of friends) {
      const sub = f.subscriptionRequests[0];
      const entry = f.account
        ? await this.prisma.ledgerEntry.findFirst({
            where: {
              accountId: f.account.id,
              amountCents: { lt: 0 },
              transaction: { kind: 'TOURNAMENT_BUYIN', NOT: { referenceId: { contains: '#refunded-' } } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : null;
      const subCents = sub?.amountCents ?? 0n;
      const entryCents = entry ? -entry.amountCents : 0n;
      const pct = MEMBER_COMMISSION_PCT[(sub?.plan ?? 'NONE') as Subscription];
      const base = subCents + entryCents;
      const row: MemberReferral = {
        userId: f.id,
        displayName: f.displayName,
        phone: f.phone,
        referredAt: f.referredAt,
        subscription: f.subscription,
        firstSubscription: sub
          ? { plan: sub.plan, amountCents: subCents.toString(), at: sub.settledAt ?? sub.requestedAt }
          : null,
        firstEntry: entry ? { amountCents: entryCents.toString(), at: entry.createdAt } : null,
        pct,
        baseCents: base.toString(),
        commissionCents: (commissionCents(base, pct) ?? 0n).toString(),
      };
      const list = out.get(f.referredById!) ?? [];
      list.push(row);
      out.set(f.referredById!, list);
    }
    return out;
  }

  private async agentOr404(id: string): Promise<Agent> {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agente não encontrado.');
    return agent;
  }

  private async freeSuggestedCode(name: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const code = suggestReferralCode(name, randomInt(100));
      if (!(await this.codeTaken(code))) return code;
    }
    throw new ConflictException('Não achei um código livre — digite um.');
  }

  private async summaries(agents: Agent[]): Promise<AgentSummary[]> {
    const referred = await this.referredOf(agents.map((a) => a.id));
    return agents.map((a) => this.summarize(a, referred.get(a.id) ?? []));
  }

  private summarize(agent: Agent, referred: ReferredPlayer[]): AgentSummary {
    const base = referred.reduce((sum, r) => sum + BigInt(r.baseCents), 0n);
    return {
      id: agent.id,
      name: agent.name,
      code: agent.code,
      phone: agent.phone,
      commissionPct: agent.commissionPct,
      active: agent.active,
      createdAt: agent.createdAt,
      players: referred.length,
      subscribers: referred.filter((r) => r.firstSubscription).length,
      baseCents: base.toString(),
      commissionCents: commissionCents(base, agent.commissionPct)?.toString() ?? null,
    };
  }

  /**
   * Each agent's players with their FIRST confirmed subscription and FIRST
   * confirmed deposit — renewals and later deposits don't count. A deposit is
   * either a manual Pix the admin confirmed or a card payment the gateway paid.
   * A plan granted by hand in the panel has no price, so it is not counted.
   */
  private async referredOf(agentIds: string[]): Promise<Map<string, ReferredPlayer[]>> {
    const out = new Map<string, ReferredPlayer[]>();
    if (agentIds.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { createdAt: 'asc' },
      include: {
        agent: true,
        subscriptionRequests: { where: { status: 'CONFIRMED' }, orderBy: { settledAt: 'asc' }, take: 1 },
        deposits: { where: { status: 'CONFIRMED' }, orderBy: { settledAt: 'asc' }, take: 1 },
        paymentOrders: { where: { purpose: 'DEPOSIT', status: 'PAID' }, orderBy: { paidAt: 'asc' }, take: 1 },
      },
    });
    for (const u of users) {
      const sub = u.subscriptionRequests[0];
      const pix = u.deposits[0];
      const card = u.paymentOrders[0];
      const pixAt = pix ? (pix.settledAt ?? pix.requestedAt) : null;
      const cardAt = card ? (card.paidAt ?? card.createdAt) : null;
      const firstDeposit =
        pix && (!card || pixAt!.getTime() <= cardAt!.getTime())
          ? { amountCents: pix.amountCents, at: pixAt!, via: 'PIX' as const }
          : card
            ? { amountCents: card.amountCents, at: cardAt!, via: 'CARTAO' as const }
            : null;
      const base = (sub?.amountCents ?? 0n) + (firstDeposit?.amountCents ?? 0n);
      const row: ReferredPlayer = {
        userId: u.id,
        displayName: u.displayName,
        phone: u.phone,
        linkedAt: u.agentLinkedAt,
        subscription: u.subscription,
        firstSubscription: sub
          ? { plan: sub.plan, amountCents: sub.amountCents.toString(), at: sub.settledAt ?? sub.requestedAt }
          : null,
        firstDeposit: firstDeposit ? { ...firstDeposit, amountCents: firstDeposit.amountCents.toString() } : null,
        baseCents: base.toString(),
        commissionCents: commissionCents(base, u.agent!.commissionPct)?.toString() ?? null,
      };
      const list = out.get(u.agentId!) ?? [];
      list.push(row);
      out.set(u.agentId!, list);
    }
    return out;
  }
}
