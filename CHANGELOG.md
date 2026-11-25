# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue
[Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Guia da skill para quando o conector não abre por falta do Node.js: o assistente avisa o que vai instalar e por quê, pede autorização, instala pelo `winget` ou `brew` no Claude Code, orienta a instalação manual quando não consegue (ou no Cowork) e pode explicar como o usuário libera, ele mesmo, esses comandos para o assistente rodar sem pedir aprovação a cada vez.

## [0.3.0] - 2026-11-23

### Adicionado

- Identificação de quem recebeu ou pagou pelo CPF/CNPJ que aparece na descrição de Pix, TED e boleto. As regras aprendidas passam a ficar ligadas ao CPF/CNPJ e reconhecem a mesma empresa mesmo quando o banco imprime o nome de outro jeito.
- Ferramenta `lookup_counterparty`: pesquisa o ramo da empresa pelo CNPJ no cadastro público da Receita Federal (BrasilAPI) e sugere a categoria pela atividade principal ou por marcas conhecidas (iFood, Uber, streamings, academias). O resultado fica guardado. CPF nunca é consultado.
- Ferramenta `list_counterparties` com as empresas já pesquisadas e a categoria aprendida.
- Ferramenta `import_categories`: recebe de uma vez a lista de categorias do usuário e exemplos de identificação, que viram regras; pode aplicá-las aos lançamentos ainda sem categoria.
- Categoria padrão "Distribuição de lucros" nas receitas (para pastas criadas a partir desta versão).
- Resumo do mês (`get_month_summary`) com entradas e saídas por categoria e a participação de cada uma.

## [0.2.0] - 2026-11-21

### Adicionado

- Leitura de PDFs protegidos por senha (RC4 de 40 a 128 bits, AES-128 e AES-256) e de ZIPs protegidos (ZipCrypto e WinZip AES), com a senha informada na conversa, sem guardar a senha nem gravar cópia desprotegida.
- Leitura de CSV, TXT e OFX, soltos ou dentro de ZIP, com detecção de UTF-8 ou Windows-1252.
- Ferramentas `read_document_file` e `list_input_files` e pasta `entrada` para documentos a processar.
- Confirmação em duas etapas para ações sensíveis: registro forçado, categorização em massa, cancelamento de parcelas, desativação de conta, substituição da análise do mês, troca da pasta de dados e restauração de backup.
- Cópia do estado anterior a cada alteração (últimas 50) e histórico de alterações em `dados/historico.jsonl`.
- Ferramentas `list_changes`, `list_backups` e `restore_backup` para consultar e desfazer alterações.
- Guias da skill para documentos protegidos e para segurança e desfazer alterações.

### Alterado

- Sugestões do assistente não substituem mais categorias escolhidas pelo usuário.
- Planilhas exportadas não sobrescrevem arquivos existentes; uma nova exportação do mesmo mês recebe sufixo.
- Todas as ferramentas declaram `readOnlyHint` e `destructiveHint`.

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
