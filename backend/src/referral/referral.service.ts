import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Agent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { commissionCents, isValidReferralCode, normalizeReferralCode, suggestReferralCode } from './referral';

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

  async create(input: { name: string; code?: string; phone?: string; commissionPct?: number | null }): Promise<AgentSummary> {
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('Informe o nome do agente.');
    let code: string;
    if (input.code?.trim()) {
      code = normalizeReferralCode(input.code);
      if (!isValidReferralCode(code)) {
        throw new BadRequestException('Código: de 3 a 20 letras ou números, sem acentos.');
      }
      if (await this.prisma.agent.findUnique({ where: { code } })) {
        throw new ConflictException(`O código ${code} já é de outro agente.`);
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
   * Link a player to the agent behind [code], or unlink with null. For players
   * who signed up without typing it (the client controls these by hand until
   * the app asks for the code).
   */
  async link(userId: string, code: string | null): Promise<{ agentId: string | null; code: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Jogador não encontrado.');
    if (code === null || code.trim() === '') {
      await this.prisma.user.update({ where: { id: userId }, data: { agentId: null, agentLinkedAt: null } });
      return { agentId: null, code: null };
    }
    const agent = await this.prisma.agent.findUnique({ where: { code: normalizeReferralCode(code) } });
    if (!agent) throw new BadRequestException('Código de indicação inválido.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { agentId: agent.id, agentLinkedAt: user.agentId === agent.id ? user.agentLinkedAt : new Date() },
    });
    return { agentId: agent.id, code: agent.code };
  }

  private async agentOr404(id: string): Promise<Agent> {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agente não encontrado.');
    return agent;
  }

  private async freeSuggestedCode(name: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const code = suggestReferralCode(name, randomInt(100));
      if (!(await this.prisma.agent.findUnique({ where: { code } }))) return code;
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
