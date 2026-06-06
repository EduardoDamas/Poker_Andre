import { useEffect, useState } from 'react';
import { api } from '../api';

interface PendingOtp {
  phone: string;
  code: string;
  requestedAt: number;
}

export function OtpRequests({ token }: { token: string }) {
  const [rows, setRows] = useState<PendingOtp[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.pendingOtps(token);
      setRows(data);
      setError(null);
    } catch {
      setError('Erro ao carregar códigos.');
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // poll every 5 s
    return () => clearInterval(id);
  }, [token]);

  function timeAgo(ms: number) {
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 60) return `${diff}s atrás`;
    return `${Math.floor(diff / 60)}m atrás`;
  }

  return (
    <section>
      <h2>Códigos OTP pendentes <span style={{ fontSize: 13, color: '#888' }}>(atualiza a cada 5s)</span></h2>
      {error && <p className="error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">Nenhum código solicitado nos últimos 10 minutos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Telefone</th>
              <th>Código</th>
              <th>Solicitado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.phone}</td>
                <td>
                  <code style={{ fontSize: 20, letterSpacing: 4, color: '#e8c97a' }}>{r.code}</code>
                </td>
                <td>{timeAgo(r.requestedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
