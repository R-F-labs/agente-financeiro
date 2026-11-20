# Conciliação e pendências

O servidor concilia automaticamente:

- **Parcelas:** cria as parcelas futuras ao ler "1/6" e confirma cada uma quando aparece na fatura seguinte.
- **Pagamento de fatura:** débito em conta igual ao total da fatura, entre 5 dias antes e 3 dias depois do vencimento. As compras da fatura passam a ter a data do pagamento como data de caixa.
- **Transferências entre contas próprias:** saída numa conta e entrada de mesmo valor em outra conta do usuário em até 3 dias úteis. Se o destino for conta de investimento, vira aplicação; se a origem for, vira resgate.

O que não fecha vira **pendência**. Liste com `list_pending` e resolva com o usuário, uma por vez.

## Tipos de pendência

| Tipo | O que perguntar | Como resolver |
|---|---|---|
| `own_transfer_unmatched` | "Este Pix para você mesmo foi para qual conta?" | Se a conta de destino não estiver cadastrada, cadastre e peça o extrato dela. Se foi gasto, `update_transaction` com `nature: "expense"` e categorize. Depois `resolve_pending`. |
| `reconciliation_ambiguous` | Mostre as opções e pergunte qual é a outra ponta | `update_transaction` com `nature` e `linked_transaction_id`; depois `resolve_pending` |
| `card_payment_unmatched` | "Parece pagamento de fatura. Quer enviar a fatura? Foi pagamento parcial?" | Registre a fatura (a conciliação acontece sozinha) ou marque `nature: "card_payment"` |
| `asset_unmapped` | Dados do ativo | Veja `investimentos.md` |
| `installment_mismatch` | Explique que pode haver parcelas de antes do início do uso | Se o usuário souber as parcelas antigas, registre a fatura anterior; senão `resolve_pending` explicando |

## Parcelas canceladas

Antecipação, quitação ou estorno de uma compra parcelada: `update_transaction` com `cancel_remaining_installments: true` no lançamento da parcela.

## Regras

- Nunca resolva uma pendência sem a resposta do usuário, exceto quando a solução for evidente pelos próprios dados (por exemplo, a outra ponta apareceu num extrato enviado depois).
- Registre a decisão em `resolution` com uma frase clara.
