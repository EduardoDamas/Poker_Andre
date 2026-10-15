# Proposta de texto — Regulamento dos Torneios: fichas iniciais por indicação

**Situação:** rascunho para aprovação do André (e, se ele quiser, do advogado). **Ainda não
publicado.** O Regulamento no ar (`backend/legal/REGULAMENTO_DOS_TORNEIOS.html`) não foi alterado.

**Por que:** desde a versão de 2026-10 (código de indicação), nos torneios pagos um participante
indicado que tenha assinatura ativa começa com mais fichas do que os demais, embora todos paguem a
mesma inscrição. Isso precisa estar escrito no Regulamento que o jogador aceita no cadastro, para
evitar reclamações.

**Onde entra:** como subitem da seção 6 ("Participação na premiação por assinatura"), logo após o
último parágrafo.

---

## Texto proposto

> **6.1 FICHAS INICIAIS DE PARTICIPANTES INDICADOS**
>
> Nos torneios com valor de inscrição, o participante que se cadastrou com um código de indicação
> (de um agente parceiro ou de outro participante) e que possua assinatura ativa no momento do
> início do torneio começará a disputa com uma quantidade maior de fichas, conforme o seu plano:
> Mensal, 1.500 fichas; Trimestral, 2.000 fichas; Semestral, 2.500 fichas; Anual, 3.000 fichas.
> Os demais participantes começam com 1.000 fichas.
>
> A quantidade de fichas é definida pelo plano ativo no início de cada torneio. Em caso de
> renovação ou troca de plano, passa a valer a quantidade correspondente ao novo plano; se a
> assinatura estiver vencida, o participante começa com 1.000 fichas.
>
> Nos torneios sem valor de inscrição (promocionais), todos os participantes começam com a mesma
> quantidade de fichas.
>
> As fichas são unidades de jogo, sem valor monetário, não podem ser convertidas em dinheiro e não
> garantem classificação, vitória ou recebimento de premiação.
>
> **6.2 COMISSÃO POR INDICAÇÃO**
>
> O participante que indicar outra pessoa por meio do seu código poderá receber uma comissão,
> calculada sobre o valor da primeira assinatura contratada pelo indicado e sobre o valor da
> inscrição do primeiro torneio pago de que o indicado participar, nos seguintes percentuais,
> conforme o plano dessa primeira assinatura: Mensal, 5%; Trimestral, 10%; Semestral, 15%;
> Anual, 20%. Renovações e inscrições posteriores não geram comissão, e não há comissão quando o
> indicado não contratar assinatura. A forma e o prazo de pagamento serão informados pela
> plataforma.

---

**Ao publicar:** atualizar o HTML em `backend/legal/`, a data de atualização do documento e a
versão em `backend/src/auth/legal-version.ts` (os novos cadastros passam a registrar o aceite da
nova versão), depois deploy.
