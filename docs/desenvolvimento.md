# Desenvolvimento

## Requisitos

- Node.js 18.17 ou superior.
- Git.
- Claude Code (opcional), para testar o plugin instalado.

Não há dependências para instalar.

## Comandos

Na raiz do repositório:

| Comando | O que faz |
|---|---|
| `npm test` | Roda todos os testes (`node --test`) |
| `npm run check` | Verifica a sintaxe de todos os arquivos JavaScript |
| `npm run docs` | Regenera `docs/ferramentas.md` a partir das definições das ferramentas |
| `npm start` | Inicia o servidor MCP em stdio (útil com o MCP Inspector) |

## Testar o plugin localmente

Com o Claude Code:

```bash
claude plugin validate .
claude --plugin-dir ./plugin
```

Ou registre o repositório local como catálogo:

```bash
claude plugin marketplace add ./
claude plugin install agente-financeiro@agente-financeiro
```

Para inspecionar o servidor isoladamente:

```bash
npx @modelcontextprotocol/inspector node plugin/server/src/index.js
```

Variáveis de ambiente úteis em desenvolvimento:

| Variável | Uso |
|---|---|
| `AGENTE_FINANCEIRO_CONFIG_DIR` | Pasta das configurações do plugin (padrão: `CLAUDE_PLUGIN_DATA` ou `~/.agente-financeiro`) |
| `AGENTE_FINANCEIRO_DATA_DIR` | Força a pasta de dados, ignorando a configuração salva |

## Arquivos de teste da leitura

Os PDFs e ZIPs em `plugin/server/test/fixtures/` são fictícios e gerados por `plugin/server/scripts/build-reader-fixtures.py`. A criptografia é produzida por implementações independentes (qpdf, por meio do pikepdf, e os geradores do próprio script), para que os testes confiram o leitor contra arquivos de terceiros. Para gerar de novo (requer Python com reportlab, pikepdf e cryptography):

```bash
cd plugin/server
python3 scripts/build-reader-fixtures.py
```

A senha de todos os arquivos protegidos é `12345678900` e a de proprietário é `dono-exemplo`.

## Convenções

- Código, nomes e comentários em inglês. Textos exibidos ao usuário, skill e documentação em português.
- Módulos ES (`import`/`export`), JSDoc nas funções públicas.
- Regras de negócio em `src/domain/`, sem acesso a disco ou rede, para serem testáveis isoladamente.
- Toda ferramenta nova: definição em `src/tools/<contexto>-tools.js`, registro em `src/tools/index.js`, teste e `npm run docs`.
- Toda ferramenta declara `annotations` com `readOnlyHint` e, se altera dados, `destructiveHint`. O registro recusa ferramentas sem anotações.
- Ações que sobrescrevem, cancelam ou trocam escolhas do usuário declaram `confirm`, que descreve a mudança e ativa a confirmação em duas etapas.
- Nenhuma ferramenta apaga registros; use desativação, cancelamento ou status.
- Nunca use dados financeiros reais em testes ou exemplos. Use valores e nomes fictícios.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/) com descrição em português:

```
feat(conciliacao): identifica pagamento parcial de fatura
fix(leitura): considera virada de ano em faturas de janeiro
docs(skill): detalha layout da fatura do Banco X
```

## Publicar uma versão

1. Atualize `version` em `plugin/.claude-plugin/plugin.json`, `plugin/server/package.json` e `package.json`.
2. Registre as mudanças no `CHANGELOG.md`.
3. Faça o commit, crie a tag `vX.Y.Z` e envie para o GitHub.

Os usuários recebem a nova versão ao atualizar o plugin no Claude.
