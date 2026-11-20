# Nubank: fatura do cartão de crédito

PDF digital, sem senha. Use sempre o **PDF**: o CSV exportado pelo app não traz total, vencimento nem final do cartão, não separa juros e IOF e tem diferenças de centavos em relação ao PDF.

## Como reconhecer

- "Nu Pagamentos S.A." no rodapé.
- Capa com "Esta é a sua fatura de <mês>, no valor de R$ ...", "Data de vencimento" e "Período vigente".
- Página "RESUMO DA FATURA ATUAL" e seções "TRANSAÇÕES DE dd MMM A dd MMM".

## O que ignorar

- Páginas de alternativas de pagamento, parcelamento da fatura, rotativo, encargos e CET.
- Limites disponíveis.
- Subtotal por portador ("Nome abreviado  R$ x") e subtotal da seção "Pagamentos e Financiamentos".
- Linhas de conversão cambial ("BRL 277.77 = USD 55.27", "Conversão: ...").
- Cabeçalho e rodapé repetidos em cada página.

## Totais (resumo da fatura)

| Campo | Origem |
|---|---|
| `previous_balance` | Fatura anterior |
| `previous_payment` | Pagamento recebido (negativo) |
| `total` | Total a pagar |
| `next_invoice_open` | Próximas faturas: "Saldo em aberto da próxima fatura" |
| `due_date` | Data de vencimento |

## Linhas

- Formato: `DD MMM  [•••• NNNN]  descrição  R$ valor`. O final do cartão é opcional (IOF, NuPay, Pix e boleto no crédito e renegociação vêm sem cartão).
- Meses em português abreviado (JAN, FEV, MAR, ABR, MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ), sem ano: use o ano do período.
- Valores negativos usam o sinal "−" tipográfico.
- O usuário pode ter mais de um cartão (físico e virtual) na mesma fatura.

| Linha | Como registrar |
|---|---|
| Compra comum | `purchase` |
| "... - Parcela n/N" | `purchase` com `installment` |
| `IOF de "..."` | `iof` |
| "Pagamento em dd MMM" | `previous_payment` |
| "Renegociação de pendências - Parcela n/N" | `financing` com `installment` (é dívida, não compra) |
| Pix no crédito / Boleto no crédito, seguido de "Total a pagar: R$ X (valor da transação de R$ A + R$ B de IOF + R$ C de juros)" | `financing` com `financed.principal = A` e `financed.charges = B + C` |
| iFood - NuPay e similares | `purchase` sem cartão |

## Conferência esperada

Fatura anterior + pagamento + soma das linhas = total a pagar. O próprio PDF pode ter diferença de R$ 0,01 entre o valor da linha e o detalhe "Total a pagar" (arredondamento do emissor): por isso use tolerância de 5 centavos na conta do cartão.

## Atenção para o fechamento

- Pix e boleto no crédito, renegociação e rotativo são **dívidas caras**: prioridade máxima na análise.
- O texto da renegociação traz saldo parcelado, encargos acumulados e valor original: cite esses números ao comentar a dívida.
