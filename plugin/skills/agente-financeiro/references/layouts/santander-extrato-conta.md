# Santander: extrato de conta corrente

PDF gerado pelo internet banking. Texto selecionável, sem senha.

## Como reconhecer

- Título "EXTRATO DE CONTA".
- Linha "Agência: NNNN | Conta: NN.NNNNNN.N".
- "Período: dd/mm/aaaa a dd/mm/aaaa" e "Titular".
- Quadro com **Saldo inicial**, **Entradas**, **Saídas** e **Saldo final**.
- Seção "DETALHE DOS MOVIMENTOS" com colunas Data, Descrição, Valor e Saldo.

## Particularidades

- **Ordem decrescente** (mais recente primeiro). Pode enviar na ordem do documento.
- **Período livre**: o usuário pode baixar 30, 60 ou 90 dias. Períodos sobrepostos são normais; o servidor ignora o que já foi registrado.
- Cada linha tem **valor e saldo após o lançamento**. Envie sempre `balance_after`.
- Saldo e valores podem ser **negativos** (cheque especial): "-R$ 1.234,56".
- Cabeçalhos de dia por extenso ("Segunda, 16 de novembro de 2026") não são lançamentos.
- Cabeçalho e títulos de colunas se repetem em cada página; rodapé "n/N".
- A descrição ocupa **duas linhas** em volta da linha de data e valor: em cima o tipo ("Pix enviado"), embaixo o complemento (contraparte truncada em cerca de 21 caracteres, data e estabelecimento da compra no débito, ou mês de referência). Lançamentos sem complemento ocupam uma linha.

## Tipos de lançamento

| Texto | `kind` | Observação |
|---|---|---|
| Pix enviado | `pix_sent` | Contraparte no complemento |
| Pix recebido | `pix_received` | Contraparte no complemento |
| Debito aut. conta ..., Debito autom empresas conveniadas | `automatic_debit` | Concessionária ou seguradora no complemento |
| Pagamento conta ... em canais | `bill_payment` | |
| Compra cartao deb ... | `debit_card` | Complemento "DD/MM estabelecimento": use essa data como `competence_date` |
| Tarifa mensalidade pacote servicos | `fee` | Complemento "Mês / Ano": `competence_date` no último dia desse mês |
| Juros saldo utiliz ate limite | `interest` | Complemento "Periodo: dd/mm a dd/mm/aa": `competence_date` no fim do período |
| Iof ... | `iof` | Idem |
| Remuneracao aplicacao automatica | `yield` | Rendimento da conta remunerada |

## Conferência esperada

Três verificações devem fechar no centavo: saldo inicial + movimentos = saldo final; soma das entradas e soma das saídas iguais ao quadro do cabeçalho; e a cadeia de saldos linha a linha.

## Atenção

- Pix para o próprio titular (nome truncado igual ao do usuário) costuma ser transferência para outra conta dele. O servidor marca como transferência provisória e abre pendência; pergunte para qual conta foi.
- Juros e IOF de cheque especial recorrentes indicam dívida cara: destaque no fechamento.
