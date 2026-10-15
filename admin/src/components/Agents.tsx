import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Agent, AgentReport, ApiError, MemberReferrer, MemberReport } from '../api';
import { formatBRL } from '../money';

const PLAN_LABELS: Record<string, string> = {
  NONE: 'Sem assinatura',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const commission = (cents: string | null) => (cents === null ? <span className="muted">—</span> : formatBRL(cents));

/// Agents and their referral codes (client, 2026-10-12). A player types the
/// code at sign-up — or the admin links them in Jogadores — and the agent's
/// commission is on the player's FIRST subscription + FIRST deposit.
export function Agents({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [pct, setPct] = useState('');

  const load = useCallback(() => {
    api
      .agents(token)
      .then(setAgents)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar agentes.');
      });
  }, [token, onForbidden]);

  useEffect(() => load(), [load]);

  async function openReport(a: Agent) {
    try {
      setReport(await api.agentReport(token, a.id));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Falha ao carregar o relatório.');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const agent = await api.createAgent(token, {
        name: name.trim(),
        code: code.trim() || undefined,
        phone: phone.trim() || undefined,
        commissionPct: pct.trim() === '' ? null : Number(pct),
      });
      setName('');
      setCode('');
      setPhone('');
      setPct('');
      alert(`Agente criado. Código: ${agent.code}`);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o agente.');
    } finally {
      setBusy(false);
    }
  }

  async function update(a: Agent, changes: Partial<Pick<Agent, 'commissionPct' | 'active'>>) {
    try {
      await api.updateAgent(token, a.id, changes);
      load();
      if (report?.id === a.id) setReport(await api.agentReport(token, a.id));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Ação falhou.');
    }
  }

  function changePct(a: Agent) {
    const typed = prompt(`Comissão de ${a.name} em % (vazio = ainda não combinada):`, a.commissionPct?.toString() ?? '');
    if (typed === null) return;
    const value = typed.trim() === '' ? null : Number(typed.replace(',', '.'));
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) {
      alert('Digite um número inteiro de 0 a 100.');
      return;
    }
    void update(a, { commissionPct: value });
  }

  function toggle(a: Agent) {
    const verb = a.active ? 'Desativar' : 'Reativar';
    const note = a.active ? '\n\nO código deixa de funcionar no cadastro; os jogadores já vinculados continuam.' : '';
    if (!confirm(`${verb} ${a.name} (${a.code})?${note}`)) return;
    void update(a, { active: !a.active });
  }

  if (error) return <p className="error">{error}</p>;
  if (!agents) return <p className="muted">Carregando…</p>;

  return (
    <>
      <p className="muted">
        O jogador digita o código do agente no cadastro (ou você vincula em Jogadores). A comissão é
        sobre a <strong>primeira assinatura + o primeiro depósito</strong> de cada indicado — renovações não
        contam. Nas promoções, o indicado começa com mais fichas pelo plano no início do torneio:
        Mensal 1.500 · Trimestral 2.000 · Semestral 2.500 · Anual 3.000 (sem plano ou sem código: 1.000).
      </p>

      <h2>Novo agente</h2>
      <form className="promo-form" onSubmit={create}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} />
        </label>
        <label>
          Código (vazio = gerar)
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="ex.: JOAO10" />
        </label>
        <label>
          Telefone (opcional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </label>
        <label>
          Comissão % (opcional)
          <input type="number" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || name.trim().length < 2}>Criar agente</button>
      </form>
      {formError && <p className="error">{formError}</p>}

      <h2>Agentes</h2>
      {agents.length === 0 ? (
        <p className="muted">Nenhum agente cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Agente</th>
              <th>Código</th>
              <th>Indicados</th>
              <th>Assinantes</th>
              <th>Base (1ª assin. + 1º dep.)</th>
              <th>Comissão</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  {a.phone ? <div className="muted">{a.phone}</div> : null}
                </td>
                <td>
                  <strong>{a.code}</strong>{' '}
                  {!a.active && <span className="badge badge-danger">INATIVO</span>}
                </td>
                <td>{a.players}</td>
                <td>{a.subscribers}</td>
                <td>{formatBRL(a.baseCents)}</td>
                <td>
                  {commission(a.commissionCents)}
                  <div className="muted">{a.commissionPct === null ? 'sem % definida' : `${a.commissionPct}%`}</div>
                </td>
                <td className="actions">
                  <button onClick={() => openReport(a)}>Relatório</button>
                  <button onClick={() => changePct(a)}>Comissão %</button>
                  <button className={a.active ? 'reject' : ''} onClick={() => toggle(a)}>
                    {a.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report && <Report report={report} onClose={() => setReport(null)} />}

      <Members token={token} />
    </>
  );
}

/// Players who invited friends with their own code (client, 2026-10-14). The
/// commission is fixed: by the plan of the friend's first subscription, a share
/// of that subscription + of the friend's first paid tournament entry.
function Members({ token }: { token: string }) {
  const [list, setList] = useState<MemberReferrer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MemberReport | null>(null);

  useEffect(() => {
    api.memberReferrers(token).then(setList).catch(() => setError('Falha ao carregar as indicações de jogadores.'));
  }, [token]);

  async function open(m: MemberReferrer) {
    try {
      setReport(await api.memberReport(token, m.userId));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Falha ao carregar o relatório.');
    }
  }

  return (
    <section aria-label="Indicações de jogadores">
      <h2>Indicações de jogadores</h2>
      <p className="muted">
        Cada jogador tem um código próprio (no Perfil do app). Comissão de quem indica, pelo plano da 1ª
        assinatura do indicado: Mensal 5% · Trimestral 10% · Semestral 15% · Anual 20% — sobre a 1ª
        assinatura + a inscrição do 1º torneio pago. Sem assinatura, sem comissão.
      </p>
      {error ? (
        <p className="error">{error}</p>
      ) : !list ? (
        <p className="muted">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="muted">Nenhum jogador indicou alguém ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Código</th>
              <th>Indicados</th>
              <th>Assinantes</th>
              <th>Comissão</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.displayName}
                  <div className="muted">{m.phone}</div>
                </td>
                <td><strong>{m.code ?? '—'}</strong></td>
                <td>{m.invited}</td>
                <td>{m.subscribers}</td>
                <td>{formatBRL(m.commissionCents)}</td>
                <td className="actions">
                  <button onClick={() => open(m)}>Relatório</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report && <MemberReportView report={report} onClose={() => setReport(null)} />}
    </section>
  );
}

function MemberReportView({ report, onClose }: { report: MemberReport; onClose: () => void }) {
  return (
    <section aria-label={`Indicados de ${report.displayName}`}>
      <h2>
        Indicados de {report.displayName} ({report.code}) <button onClick={onClose}>Fechar</button>
      </h2>
      <table>
        <thead>
          <tr>
            <th>Indicado</th>
            <th>Telefone</th>
            <th>1ª assinatura</th>
            <th>1º torneio pago</th>
            <th>%</th>
            <th>Comissão</th>
          </tr>
        </thead>
        <tbody>
          {report.referred.map((r) => (
            <tr key={r.userId}>
              <td>{r.displayName}</td>
              <td>{r.phone}</td>
              <td>
                {r.firstSubscription ? (
                  <>
                    {PLAN_LABELS[r.firstSubscription.plan] ?? r.firstSubscription.plan} · {formatBRL(r.firstSubscription.amountCents)}
                    <div className="muted">{day(r.firstSubscription.at)}</div>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {r.firstEntry ? (
                  <>
                    {formatBRL(r.firstEntry.amountCents)}
                    <div className="muted">{day(r.firstEntry.at)}</div>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{r.pct ? `${r.pct}%` : <span className="muted">—</span>}</td>
              <td>{formatBRL(r.commissionCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}><strong>Total</strong></td>
            <td><strong>{formatBRL(report.commissionCents)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Report({ report, onClose }: { report: AgentReport; onClose: () => void }) {
  return (
    <section aria-label={`Relatório de ${report.name}`}>
      <h2>
        Relatório · {report.name} ({report.code}){' '}
        <button onClick={onClose}>Fechar</button>
      </h2>
      {report.referred.length === 0 ? (
        <p className="muted">Nenhum jogador indicado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Telefone</th>
              <th>Vinculado em</th>
              <th>1ª assinatura</th>
              <th>1º depósito</th>
              <th>Base</th>
              <th>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {report.referred.map((r) => (
              <tr key={r.userId}>
                <td>{r.displayName}</td>
                <td>{r.phone}</td>
                <td>{r.linkedAt ? day(r.linkedAt) : '—'}</td>
                <td>
                  {r.firstSubscription ? (
                    <>
                      {PLAN_LABELS[r.firstSubscription.plan] ?? r.firstSubscription.plan} ·{' '}
                      {formatBRL(r.firstSubscription.amountCents)}
                      <div className="muted">{day(r.firstSubscription.at)}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {r.firstDeposit ? (
                    <>
                      {formatBRL(r.firstDeposit.amountCents)} · {r.firstDeposit.via === 'PIX' ? 'Pix' : 'Cartão'}
                      <div className="muted">{day(r.firstDeposit.at)}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{formatBRL(r.baseCents)}</td>
                <td>{commission(r.commissionCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}><strong>Total</strong></td>
              <td><strong>{formatBRL(report.baseCents)}</strong></td>
              <td><strong>{commission(report.commissionCents)}</strong></td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}
