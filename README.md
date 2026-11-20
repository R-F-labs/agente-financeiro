# Agente Financeiro

Plugin para o Claude que funciona como analista financeiro pessoal. Lê extratos bancários, faturas de cartão e extratos de investimento em PDF, confere os valores com os totais de cada documento, categoriza os gastos, acompanha parcelas, carteira e metas e, todo mês, entrega um diagnóstico com as decisões mais importantes em ordem de prioridade.

Todos os dados ficam guardados no computador do usuário.

- [O que o plugin faz](#o-que-o-plugin-faz)
- [Como funciona](#como-funciona)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Primeiros passos](#primeiros-passos)
- [Uso no dia a dia](#uso-no-dia-a-dia)
- [Onde ficam os dados](#onde-ficam-os-dados)
- [Documentos suportados](#documentos-suportados)
- [Atualização e desinstalação](#atualização-e-desinstalação)
- [Instruções para o assistente](#instruções-para-o-assistente)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Documentação](#documentação)
- [Limitações](#limitações)

## O que o plugin faz

| Área | Funcionalidades |
|---|---|
| Leitura de documentos | Extratos de conta corrente, faturas de cartão e extratos de investimento; conferência com os totais do próprio documento e nova leitura guiada quando não fecha |
| Organização | Eliminação de lançamentos repetidos (inclusive em extratos com períodos sobrepostos), categorização por regras aprendidas, central de pendências |
| Conciliação | Parcelas futuras previstas e confirmadas fatura a fatura, pagamento de fatura, transferências entre contas próprias, aplicações e resgates |
| Relatórios | Fluxo de caixa por competência e por caixa, desvios por categoria contra a média, compromissos futuros, custo com juros e IOF |
| Investimentos | Posição mensal por ativo, rentabilidade no mês e em 12 meses, comparação com CDI, IPCA, Ibovespa e IFIX, concentração e liquidez |
| Mercado | Selic, CDI, IPCA, IGP-M, dólar e expectativas do Focus (Banco Central); cotações da B3 (brapi.dev) |
| Fechamento mensal | Pacote com todos os números já calculados e análise com diagnóstico, cenários e decisões priorizadas, com registro das respostas do usuário |
| Planilhas | Exportação para Excel (fluxo de caixa, gastos por competência, lançamentos, compromissos e carteira) |

## Como funciona

O plugin tem duas partes que trabalham juntas:

| Parte | Responsabilidade |
|---|---|
| **Skill** | Ensina o Claude a agir como analista: como ler cada documento, quando perguntar, como conciliar e como conduzir o fechamento do mês |
| **Conector local (MCP)** | Programa que roda no computador do usuário: guarda os dados, confere os totais, elimina duplicidades, faz todas as contas, busca dados de mercado e gera planilhas |

O Claude lê e interpreta; o conector confere e calcula. Nenhum número da análise é calculado pela IA.

```
Usuário ── conversa e PDFs ──▶ Claude + skill ── ferramentas ──▶ Conector local ──▶ Pasta de dados
```

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Requisitos

- **Claude** com suporte a plugins: aplicativo Claude Desktop (Cowork) ou Claude Code.
- **Node.js 18 ou superior** instalado no computador ([nodejs.org](https://nodejs.org), versão LTS). Para conferir, rode `node -v` no terminal.
- Acesso a este repositório no GitHub (repositório privado: o usuário precisa ter sido convidado).

O conector local funciona no aplicativo de computador (Cowork) e no Claude Code. Ele não roda no aplicativo de celular nem no Claude pela web. As planilhas geradas podem ser abertas no celular quando a pasta de dados estiver num serviço de nuvem.

## Instalação

### Opção 1: pelo aplicativo Claude

1. Abra **Customize (Personalizar) → Plugins → Add → Add marketplace**.
2. Informe `https://github.com/R-F-labs/agente-financeiro`.
3. Instale o plugin **Agente Financeiro**.
4. Abra uma tarefa no Cowork e escreva: **"Configurar meu Agente Financeiro"**.

### Opção 2: pelo Claude Code

```bash
claude plugin marketplace add R-F-labs/agente-financeiro
claude plugin install agente-financeiro@agente-financeiro
```

Depois, numa sessão do Claude Code: **"Configurar meu Agente Financeiro"**.

### Opção 3: pedir ao próprio Claude

No Claude Code, envie: *"Instale o plugin descrito em https://github.com/R-F-labs/agente-financeiro seguindo as instruções do README."* O assistente segue a seção [Instruções para o assistente](#instruções-para-o-assistente).

## Primeiros passos

Na primeira conversa, o assistente conduz a configuração:

1. **Pasta de dados:** onde os dados ficam guardados. Recomenda-se uma pasta dentro do Google Drive, OneDrive ou iCloud Drive, para ter cópia na nuvem e abrir as planilhas no celular.
2. **Perfil:** nome como aparece nos extratos, dia do fechamento, perfil de investidor, horizonte, meta de reserva de emergência e restrições.
3. **Contas:** bancos, cartões e corretoras (apenas os 4 últimos dígitos).
4. **Categorias:** revisão das categorias padrão.
5. **Metas:** valor, prazo e prioridade.
6. **Primeiro documento:** envio do extrato ou da fatura mais recente.

## Uso no dia a dia

Exemplos de pedidos:

| Pedido | O que acontece |
|---|---|
| "Registra o extrato do Santander e a fatura do Nubank" (com os PDFs anexados) | Leitura, conferência, categorização e conciliação |
| "Quanto gastei com aplicativos de transporte em outubro?" | Consulta aos lançamentos |
| "Quanto tenho de parcelas nos próximos meses?" | Compromissos futuros |
| "Como está minha carteira?" | Posição, rentabilidade e comparação com a referência |
| "Fecha o mês de outubro" | Pacote do mês, diagnóstico, cenários e decisões priorizadas |
| "Gera a planilha" | Arquivo Excel na pasta `planilhas` |

## Onde ficam os dados

```
<pasta escolhida>/
├── LEIA-ME.txt
├── dados/
│   ├── agente-financeiro.json     Base de dados (não editar manualmente)
│   └── backups/                   Cópias diárias dos últimos 30 dias
└── planilhas/                     Planilhas geradas
```

- Nada é enviado a servidores do plugin. As únicas consultas externas são aos dados públicos de mercado.
- Os PDFs não são copiados: o assistente lê o arquivo anexado e envia ao conector apenas os lançamentos e totais.

Mais em [docs/privacidade-e-seguranca.md](docs/privacidade-e-seguranca.md).

## Documentos suportados

| Instituição | Documento | Situação |
|---|---|---|
| Santander | Extrato de conta corrente (PDF do internet banking) | Guia de leitura específico |
| Nubank | Fatura do cartão de crédito (PDF) | Guia de leitura específico |
| Demais bancos, cartões e corretoras | Extratos, faturas e extratos de investimento em PDF | Leitura pelas regras gerais, com conferência dos totais |

Não suportados nesta versão: PDFs protegidos por senha (desbloqueie antes de anexar), planilhas CSV ou ZIP exportadas por aplicativos, previdência e criptoativos. Notas de corretagem e informes de rendimentos são lidos e comentados, mas não registrados.

## Atualização e desinstalação

- **Atualizar:** em Personalizar → Plugins, atualize o Agente Financeiro, ou rode `claude plugin update agente-financeiro@agente-financeiro`.
- **Desinstalar:** a remoção do plugin não apaga a pasta de dados. Ao reinstalar, aponte a configuração para a mesma pasta e os dados são reaproveitados.

## Instruções para o assistente

Esta seção é destinada a um assistente de IA (por exemplo, Claude Code) que recebeu a tarefa de instalar o plugin no computador do usuário.

1. Verifique se o Node.js 18 ou superior está instalado com `node -v`. Se não estiver, peça ao usuário para instalar a versão LTS em https://nodejs.org e aguarde.
2. Registre o catálogo: `claude plugin marketplace add R-F-labs/agente-financeiro`.
3. Instale o plugin: `claude plugin install agente-financeiro@agente-financeiro`.
4. Peça ao usuário para reiniciar a sessão (ou o aplicativo) para carregar o conector.
5. Na nova sessão, chame a ferramenta `get_status` do conector `agente-financeiro`. Se `configured` for `false`, siga o roteiro da skill `agente-financeiro`: pergunte em qual pasta os dados devem ficar (sugira uma pasta sincronizada com a nuvem) e chame `setup_workspace`.
6. Continue a configuração (perfil, contas, categorias e metas) conversando com o usuário, uma etapa por vez.

Não peça senhas, CPF ou números completos de conta ou cartão.

## Estrutura do repositório

```
.
├── .claude-plugin/
│   └── marketplace.json            Catálogo (permite instalar pela URL do repositório)
├── plugin/
│   ├── .claude-plugin/plugin.json  Manifesto do plugin e declaração do conector
│   ├── skills/agente-financeiro/   Skill e guias de referência
│   │   ├── SKILL.md
│   │   └── references/
│   └── server/                     Conector MCP local (Node.js, sem dependências)
│       ├── src/
│       ├── test/
│       └── scripts/
└── docs/                           Arquitetura, ferramentas, desenvolvimento, privacidade
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Componentes, fluxos, modelo de dados e decisões técnicas |
| [docs/ferramentas.md](docs/ferramentas.md) | Referência de todas as ferramentas do conector (gerada a partir do código) |
| [docs/desenvolvimento.md](docs/desenvolvimento.md) | Como rodar os testes, testar o plugin localmente e publicar versões |
| [docs/privacidade-e-seguranca.md](docs/privacidade-e-seguranca.md) | Onde ficam os dados e o que é compartilhado |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de versões |

## Limitações

- Ferramenta de apoio à decisão: não executa operações financeiras e não substitui assessoria de investimentos de profissional certificado.
- A qualidade da leitura depende do PDF. Documentos escaneados ou com baixa qualidade podem exigir revisão manual; a conferência dos totais impede que uma leitura incompleta seja gravada sem o conhecimento do usuário.
- O fechamento mensal acontece quando o usuário pede ao assistente; não há execução automática.
- Uso individual: um usuário por pasta de dados.

## Licença

Software proprietário. Todos os direitos reservados. Consulte [LICENSE](LICENSE).
