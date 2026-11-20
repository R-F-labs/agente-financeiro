# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue
[Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-11-20

### Adicionado

- Plugin para Claude com skill de análise financeira e conector MCP local, instalável pela URL do repositório.
- Configuração guiada: pasta de dados, perfil, contas, categorias padrão e metas.
- Registro de extratos bancários, faturas de cartão e extratos de investimento com conferência contra os totais do documento, incluindo cadeia de saldo linha a linha.
- Eliminação de lançamentos repetidos em extratos com períodos sobrepostos.
- Categorização por regras aprendidas com o usuário.
- Parcelas futuras previstas e confirmadas fatura a fatura; separação de juros e IOF em Pix e boleto no crédito.
- Conciliação de pagamento de fatura, transferências entre contas próprias, aplicações e resgates, com central de pendências.
- Relatórios de fluxo de caixa por competência e por caixa, desvios por categoria, compromissos futuros e carteira.
- Dados de mercado do Banco Central (Selic, CDI, IPCA, IGP-M, dólar e Focus) e cotações da brapi.dev.
- Pacote do fechamento mensal com aporte necessário por meta, reserva de emergência e comparação da carteira com referências; registro da análise e das decisões.
- Exportação de planilhas Excel.
- Guias de leitura para o extrato de conta do Santander e a fatura do Nubank.
