# Investimentos

## Classificação de ativos

Todo ativo novo de um extrato de investimentos gera a pendência `asset_unmapped`. Classifique com `update_asset` a partir do nome como aparece no extrato.

| Classe | Exemplos |
|---|---|
| `tesouro_selic`, `tesouro_prefixado`, `tesouro_ipca` | Tesouro Selic 2029, Tesouro Prefixado 2027, Tesouro IPCA+ 2035 |
| `rf_pos_cdi`, `rf_prefixado`, `rf_ipca` | CDB, LCI, LCA, LC, RDB, debêntures |
| `poupanca` | Poupança |
| `acao` | PETR4, ITUB4 |
| `fii` | HGLG11, KNRI11 |
| `etf` | BOVA11, IVVB11 |
| `fundo` | Fundos de investimento (informe o CNPJ quando houver) |
| `fora_do_escopo` | Previdência (PGBL, VGBL) e criptoativos |
| `outro` | Quando não for possível identificar |

Exemplo: "CDB BANCO X 110% CDI VENC 15/03/2027" → classe `rf_pos_cdi`, indexador `CDI`, taxa "110% CDI", vencimento 2027-03-15.

Regras:

- Não invente ticker, CNPJ, taxa, vencimento ou liquidez. Se o extrato não informar, pergunte ao usuário.
- Liquidez: `diaria`, `no_vencimento` ou `D+n`. Ativos com liquidez diária contam como reserva de emergência.
- Previdência e cripto ficam fora das análises desta versão: classifique como `fora_do_escopo` e avise o usuário.

## Mercado

`update_market_data` busca Selic, CDI acumulado em 12 meses, IPCA, IGP-M, dólar, expectativas do Focus (Banco Central) e cotações dos ativos com ticker (exige token da brapi.dev no perfil). Atualize antes de analisar a carteira ou fazer o fechamento quando os dados tiverem mais de um dia.

## Carteira

`get_portfolio` retorna, por ativo: saldo, participação, liquidez, rentabilidade no mês e em 12 meses e a referência de comparação (CDI, IPCA, Ibovespa ou IFIX). Use esses números; não recalcule.
