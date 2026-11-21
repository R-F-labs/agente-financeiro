# Leitura de documentos

Fluxo para cada documento recebido. Trate um documento por vez.

Se o arquivo estiver protegido por senha, for um ZIP ou CSV, estiver na pasta `entrada`, ou se você não conseguir abrir o anexo, leia antes com `read_document_file` (veja `documentos-protegidos.md`) e continue este roteiro com o texto devolvido.

## 1. Identificar

Leia as primeiras páginas e determine:

- **Tipo:** extrato bancário, fatura de cartão, extrato de investimentos, nota de corretagem, informe de rendimentos ou outro.
- **Instituição**, **titular** e **período** (somente o que estiver escrito; não deduza datas).
- **Conta:** associe pelo final do cartão, agência/conta ou instituição, usando `list_accounts`. Se houver mais de uma candidata ou nenhuma, pergunte (e cadastre a conta, se for nova).

Se o titular for outra pessoa, pergunte antes de continuar.

Nota de corretagem e informe de rendimentos: nesta versão, apenas comente o conteúdo com o usuário; não há registro estruturado.

Se o layout for conhecido, siga também o guia específico em `layouts/`.

## 2. Extrair

Extraia **todos** os lançamentos e os totais declarados. Regras gerais:

- Datas em AAAA-MM-DD. Se o documento mostrar só dia e mês, use o ano do período (atenção à virada de ano em extratos e faturas de dezembro e janeiro).
- `description`: o texto como aparece (tipo e complemento).
- `payee`: nome limpo do estabelecimento ou pessoa, sem códigos, datas ou cidade. Ex.: "PAG*IFOOD SAO PAULO" vira "IFOOD".
- Não resuma, não agrupe, não corrija valores. Ignore saldos parciais, subtotais e propaganda.
- Linha ilegível: não invente. Avise o usuário e peça o valor.
- Valores podem ser enviados como número (1234.56) ou como texto impresso ("R$ 1.234,56").

### Extrato bancário → `register_bank_statement`

- `totals.opening_balance` e `totals.closing_balance` sempre; `inflows` e `outflows` quando o documento trouxer.
- Entradas positivas, saídas negativas.
- `balance_after`: o saldo impresso depois de cada lançamento, quando existir. Isso permite conferir linha a linha e evita duplicidades com extratos sobrepostos.
- A ordem pode ser a do documento (o servidor detecta ordem decrescente).
- `competence_date` quando o lançamento se refere a outro mês (tarifa "Agosto / 2026", juros e IOF de cheque especial com "Periodo: 01/10 a 31/10/26": use o último dia do período), ou quando a compra no débito traz a data da compra no complemento.
- `kind` ajuda a categorizar: `pix_sent`, `pix_received`, `automatic_debit`, `bill_payment`, `debit_card`, `fee`, `interest`, `iof`, `yield`, `salary`, `transfer`, `other`.

### Fatura de cartão → `register_card_invoice`

- Valores **como impressos**: compras positivas, estornos e pagamentos negativos.
- `totals.total` (total a pagar), `due_date` (vencimento) e, quando houver, `previous_balance`, `previous_payment` e `next_invoice_open` (saldo em aberto da próxima fatura).
- Fatura anterior e pagamento recebido também entram como linhas com `line_type` `previous_balance` e `previous_payment`.
- `line_type`: `purchase`, `refund`, `fee`, `interest`, `iof`, `annual_fee`, `financing` (parcelas de renegociação, Pix e boleto no crédito), `other`.
- Parcelas ("03/06", "PARC 3/6", "Parcela 3 de 6"): preencha `installment` e use o valor **da parcela**.
- Compras internacionais: valor convertido em reais; o IOF é uma linha separada com `line_type: iof`.
- Pix ou boleto no crédito com juros: envie `financed` com `principal` (valor original da transação) e `charges` (juros + IOF). O servidor separa o gasto real do custo da dívida.
- `card_last4` quando a linha indicar o cartão.

### Extrato de investimentos → `register_investment_statement`

- Uma posição por ativo, com o nome **exatamente** como no extrato.
- Saldo inicial, aplicações, resgates, rendimentos, impostos e taxas, saldo final.
- Totais do extrato em `totals`, quando houver.
- Depois do registro, classifique os ativos novos (veja `investimentos.md`).

## 3. Conferência

O servidor só grava se os valores fecharem com os totais do documento.

Se a resposta vier com `status: validation_failed`:

1. Leia a diferença em `validation.checks`. Quando houver saldo por linha, o detalhe aponta a linha onde a conta quebra.
2. Refaça a extração **completa**, conferindo linha a linha. Causas comuns: linha omitida, sinal invertido, linha duplicada, subtotal tratado como lançamento, parcela lida com o valor total da compra, linha que continua na página seguinte.
3. Envie de novo.
4. Se a diferença persistir, mostre ao usuário o que não bate. Somente com a concordância dele, reenvie com `force: true`. O servidor responde `confirmation_required` com um resumo: mostre, espere o "sim" e repita a mesma chamada com `confirmation_token`.

Não tente fechar a conta ajustando valores por conta própria.

## 4. Depois do registro

O resultado informa:

- `added` e `duplicatesSkipped`: comente brevemente ("38 lançamentos novos; 12 já estavam registrados").
- `categorizedByRules`: categorias aplicadas por regras aprendidas.
- `uncategorized`: siga `categorizacao.md`.
- `forecastsCreated` e `installmentsConfirmed`: parcelas futuras criadas ou confirmadas.
- `reconciliation` e `openPending`: siga `conciliacao.md`.

Documentos longos: se o PDF for grande demais para ler de uma vez, peça ao usuário um período menor (por exemplo, um mês por arquivo).
