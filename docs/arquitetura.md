# Arquitetura

## Visão geral

O Agente Financeiro é um plugin para Claude com duas partes:

| Parte | Papel | Onde fica |
|---|---|---|
| **Skill** `agente-financeiro` | Ensina o assistente a agir como analista: como ler cada tipo de documento, quando perguntar, como conciliar e como fazer o fechamento mensal | `plugin/skills/agente-financeiro/` |
| **Conector MCP local** | Guarda os dados, confere totais, elimina duplicidades, concilia, calcula relatórios, busca dados de mercado e gera planilhas | `plugin/server/` |

```
Usuário ── conversa e PDFs ──▶ Claude (com a skill)
                                   │  chamadas de ferramenta (MCP, stdio)
                                   ▼
                     Conector local (Node.js, sem dependências)
                                   │
              ┌────────────────────┼──────────────────────┐
              ▼                    ▼                      ▼
   Pasta de dados do usuário   Banco Central / brapi   Planilhas .xlsx
   (JSON + backups diários)    (dados públicos)        (pasta "planilhas")
```

A divisão de responsabilidades segue o princípio central da especificação: **a IA lê, interpreta e escreve; o código confere e calcula**.

## Fluxo de um documento

1. O usuário anexa o PDF na conversa, ou deixa o arquivo (PDF, ZIP, CSV, com ou sem senha) na pasta `entrada` e informa a senha no pedido.
   - Anexo legível: o assistente lê diretamente.
   - Arquivo protegido, ZIP ou CSV: `read_document_file` abre o arquivo em memória e devolve o texto, página por página, com as colunas alinhadas.
2. O assistente identifica tipo, instituição, conta e período e extrai os lançamentos e totais.
3. A ferramenta `register_*` confere a extração contra os totais do documento. Se não fechar, nada é gravado e o servidor devolve a diferença (e, quando há saldo por linha, a linha exata onde a conta quebra). O assistente relê e reenvia.
4. Gravado o documento, o servidor:
   - descarta lançamentos já registrados (extratos com períodos sobrepostos);
   - aplica as regras de categoria aprendidas;
   - cria ou confirma parcelas futuras;
   - concilia pagamento de fatura e transferências entre contas próprias;
   - abre pendências para o que precisa de decisão do usuário.
5. O assistente categoriza o restante com o usuário e resolve as pendências.

## Fechamento mensal

`prepare_monthly_package` monta, em código, todos os números do mês: fluxo de caixa (12 meses e médias), desvios por categoria, compromissos futuros, reserva de emergência, aporte necessário por meta, carteira contra referência, mercado, valor disponível para investir, decisões recentes e lacunas de dados. O assistente escreve o diagnóstico e as decisões a partir do pacote, sem recalcular. A análise e as respostas do usuário a cada decisão ficam registradas para o mês seguinte.

## Leitura de arquivos

O módulo `src/reader/` lê arquivos sem dependências externas:

| Parte | Responsabilidade |
|---|---|
| `pdf/objects.js` | Analisador da sintaxe PDF (valores, dicionários, strings, referências) |
| `pdf/document.js` | Localiza os objetos varrendo o arquivo (tolerante a tabelas de referência danificadas e atualizações incrementais), lê object streams e a árvore de páginas |
| `pdf/security.js` | Manipulador de segurança padrão, revisões 2 a 6: RC4 de 40 a 128 bits, AES-128 e AES-256; aceita a senha de abertura ou a de proprietário |
| `pdf/filters.js` | Flate (com preditores PNG/TIFF), LZW, ASCIIHex, ASCII85 e RunLength |
| `pdf/fonts.js`, `pdf/encodings.js` | Mapas ToUnicode, codificações WinAnsi, Standard e MacRoman, fontes Type0, Type1, TrueType e Type3 |
| `pdf/text.js` | Interpreta o conteúdo das páginas (incluindo Form XObjects) e monta as linhas da esquerda para a direita, preservando as colunas |
| `zip/archive.js` | ZIP com e sem senha (ZipCrypto e WinZip AES), com limites contra arquivos compactados maliciosos |
| `document-reader.js` | Valida o caminho e o tipo do arquivo, escolhe o leitor e devolve o texto com o indicador de qualidade |

A senha recebida é usada apenas durante a chamada. Nada desprotegido é gravado em disco.

## Guardrails

| Camada | Onde | O que faz |
|---|---|---|
| Confirmação em duas etapas | `src/guardrails/confirmation.js` e `confirm` de cada ferramenta | A ferramenta descreve a mudança e devolve um código de uso único (10 minutos), ligado aos argumentos exatos. A ação só roda quando a mesma chamada volta com o código, depois do "sim" do usuário |
| Contexto da operação | `src/guardrails/operation-context.js` | Identifica a ferramenta em execução para rotular backups e histórico |
| Backup por operação e histórico | `src/storage/store.js` | Antes de cada alteração grava o estado anterior em `dados/backups/operacoes` (50 últimos) e registra a mudança em `dados/historico.jsonl` |
| Restauração | `restore_backup` | Volta a um backup com confirmação; o estado atual vira um novo backup |
| Regras fixas | Ferramentas | Sem exclusão de registros; sugestões não sobrescrevem categorias manuais; planilhas nunca sobrescritas |
| Anotações MCP | Todas as ferramentas | `readOnlyHint` e `destructiveHint` explícitos, para o Claude tratar com cuidado as ferramentas que alteram dados |

## Modelo de dados

Um único arquivo JSON (`dados/agente-financeiro.json`), regravado de forma atômica a cada alteração, com cópia do estado anterior a cada operação em `dados/backups/operacoes` (últimas 50), cópia diária em `dados/backups` (últimos 30 dias) e histórico em `dados/historico.jsonl`.

| Coleção | Conteúdo |
|---|---|
| `accounts` | Contas correntes, poupanças, cartões e contas de investimento |
| `categories`, `categoryRules` | Categorias (padrão e do usuário) e regras beneficiário → categoria |
| `goals`, `profile` | Metas e perfil do investidor |
| `documents` | Documentos registrados, com totais e resultado da conferência |
| `transactions` | Lançamentos confirmados, previstos (parcelas futuras) e cancelados |
| `assets`, `positions` | Ativos de investimento e posições mensais |
| `pending` | Pendências para o usuário decidir |
| `market` | Último retrato de indicadores e cotações |
| `analyses`, `decisions` | Fechamentos mensais e respostas do usuário |

Convenções:

- Valores em **centavos inteiros** internamente; as ferramentas devolvem reais.
- Datas de negócio como texto `AAAA-MM-DD`, sem fuso horário.
- Cada lançamento tem duas datas: **competência** (quando aconteceu) e **caixa** (quando o dinheiro saiu ou entrou; no cartão, a data do pagamento da fatura).
- Natureza do lançamento: receita, despesa, transferência, aplicação, resgate ou pagamento de fatura. Só receitas e despesas entram no fluxo de caixa.

## Por que sem dependências

O conector roda no computador do cliente, iniciado pelo próprio Claude. Sem dependências externas não há `npm install`, compilação nem módulos nativos que variam por sistema operacional: basta Node.js 18 ou superior. O protocolo MCP (JSON-RPC sobre stdio), o validador de esquemas, o leitor de PDF e ZIP (inclusive criptografia), o gerador de planilhas XLSX e o cliente HTTP usam apenas a biblioteca padrão do Node.

## Estrutura do código

```
plugin/server/src/
├── index.js            Ponto de entrada (stdio)
├── mcp/                Protocolo MCP, registro de ferramentas e apresentação dos valores
├── tools/              Definição das ferramentas, um arquivo por contexto
├── domain/             Regras de negócio puras (validação, deduplicação, parcelas,
│                       conciliação, relatórios, finanças, carteira, fechamento)
├── reader/             Leitura de PDF (com senha), ZIP (com senha), CSV e TXT
├── guardrails/         Confirmação em duas etapas e contexto da operação
├── storage/            Configuração, pasta de dados, armazenamento JSON atômico,
│                       backups por operação e histórico
├── market/             Banco Central (SGS e Focus) e brapi
├── export/             Escritor de ZIP e XLSX e as planilhas padrão
└── lib/                Dinheiro, datas, texto, validação de esquemas e erros
```
