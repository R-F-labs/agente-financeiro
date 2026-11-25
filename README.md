# Agente Financeiro

Plugin para o Claude que funciona como analista financeiro pessoal. Lê extratos bancários, faturas de cartão e extratos de investimento em PDF, ZIP ou CSV, inclusive arquivos protegidos por senha, confere os valores com os totais de cada documento, categoriza os gastos, acompanha parcelas, carteira e metas e, todo mês, entrega um diagnóstico com as decisões mais importantes em ordem de prioridade.

Todos os dados ficam guardados no computador do usuário.

- [O que o plugin faz](#o-que-o-plugin-faz)
- [Como funciona](#como-funciona)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Primeiros passos](#primeiros-passos)
- [Uso no dia a dia](#uso-no-dia-a-dia)
- [Onde ficam os dados](#onde-ficam-os-dados)
- [Documentos suportados](#documentos-suportados)
- [Segurança e desfazer alterações](#segurança-e-desfazer-alterações)
- [Atualização e desinstalação](#atualização-e-desinstalação)
- [Instruções para o assistente](#instruções-para-o-assistente)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Documentação](#documentação)
- [Limitações](#limitações)

## O que o plugin faz

| Área | Funcionalidades |
|---|---|
| Leitura de documentos | Extratos de conta corrente, faturas de cartão e extratos de investimento; conferência com os totais do próprio documento e nova leitura guiada quando não fecha |
| Arquivos protegidos | PDFs com senha (RC4 e AES até 256 bits) e ZIPs com senha (ZipCrypto e AES), abertos em memória com a senha informada na conversa, sem guardar a senha nem gravar cópia desprotegida |
| Organização | Eliminação de lançamentos repetidos (inclusive em extratos com períodos sobrepostos), categorização por regras aprendidas pelo nome ou pelo CPF/CNPJ de quem recebeu ou pagou, pesquisa do ramo da empresa pelo CNPJ, importação da lista de categorias do usuário, central de pendências |
| Conciliação | Parcelas futuras previstas e confirmadas fatura a fatura, pagamento de fatura, transferências entre contas próprias, aplicações e resgates |
| Relatórios | Resumo mensal com entradas e saídas por categoria, fluxo de caixa por competência e por caixa, desvios por categoria contra a média, compromissos futuros, custo com juros e IOF |
| Investimentos | Posição mensal por ativo, rentabilidade no mês e em 12 meses, comparação com CDI, IPCA, Ibovespa e IFIX, concentração e liquidez |
| Mercado | Selic, CDI, IPCA, IGP-M, dólar e expectativas do Focus (Banco Central); cotações da B3 (brapi.dev) |
| Fechamento mensal | Pacote com todos os números já calculados e análise com diagnóstico, cenários e decisões priorizadas, com registro das respostas do usuário |
| Planilhas | Exportação para Excel (fluxo de caixa, gastos por competência, lançamentos, compromissos e carteira) |
| Segurança | Confirmação do usuário antes de ações sensíveis, cópia do estado anterior a cada alteração, histórico de mudanças e restauração de backups |

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
- **Node.js 18 ou superior** instalado no computador ([nodejs.org](https://nodejs.org), versão LTS). Para conferir, rode `node -v` no terminal. Se não tiver, o próprio Claude avisa na primeira conversa, explica para que serve e instala (no Claude Code, com a sua aprovação) ou orienta a instalação passo a passo.
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
| "Registra a fatura do C6 que está na pasta entrada, a senha é 12345" | Abertura do ZIP com a senha, leitura do conteúdo e registro |
| "Quanto gastei com aplicativos de transporte em outubro?" | Consulta aos lançamentos |
| "Quanto tenho de parcelas nos próximos meses?" | Compromissos futuros |
| "Como está minha carteira?" | Posição, rentabilidade e comparação com a referência |
| "Fecha o mês de outubro" | Pacote do mês, diagnóstico, cenários e decisões priorizadas |
| "Gera a planilha" | Arquivo Excel na pasta `planilhas` |
| "O que você mudou hoje?" ou "Desfaz a última categorização" | Histórico de alterações e restauração, com confirmação |

## Onde ficam os dados

```
<pasta escolhida>/
├── LEIA-ME.txt
├── entrada/                       Extratos e faturas a processar (PDF, ZIP, CSV), com ou sem senha
├── dados/
│   ├── agente-financeiro.json     Base de dados (não editar manualmente)
│   ├── historico.jsonl            Registro de cada alteração
│   └── backups/
│       ├── agente-financeiro-AAAA-MM-DD.json   Cópias diárias dos últimos 30 dias
│       └── operacoes/             Estado anterior a cada alteração (últimas 50)
└── planilhas/                     Planilhas geradas (nunca sobrescritas)
```

- Nada é enviado a servidores do plugin. As únicas consultas externas são aos dados públicos de mercado.
- Os documentos não são copiados para a base: o conector guarda apenas os lançamentos, os totais e o nome do arquivo.
- Senhas de arquivos são usadas só durante a leitura, em memória. Nenhuma versão desprotegida é gravada.

Mais em [docs/privacidade-e-seguranca.md](docs/privacidade-e-seguranca.md).

## Documentos suportados

| Instituição | Documento | Situação |
|---|---|---|
| Santander | Extrato de conta corrente (PDF do internet banking) | Guia de leitura específico |
| Nubank | Fatura do cartão de crédito (PDF) | Guia de leitura específico |
| Demais bancos, cartões e corretoras | Extratos, faturas e extratos de investimento em PDF | Leitura pelas regras gerais, com conferência dos totais |
| Qualquer instituição | PDF ou ZIP protegido por senha | Aberto pelo conector com a senha informada pelo usuário |
| Qualquer instituição | CSV, TXT ou OFX exportado pelo aplicativo (solto ou dentro de ZIP) | Leitura pelas regras gerais, com conferência dos totais |

Para que o conector abra um arquivo protegido, ele precisa estar no computador: na pasta `entrada` ou em um caminho informado ao assistente. Basta escrever a senha junto com o pedido.

Não suportados nesta versão: PDFs escaneados (imagem, sem texto), previdência e criptoativos. Notas de corretagem e informes de rendimentos são lidos e comentados, mas não registrados.

## Segurança e desfazer alterações

| Proteção | Como funciona |
|---|---|
| Confirmação obrigatória | Ações sensíveis só acontecem depois que o usuário concorda com um resumo do que vai mudar: gravar documento que não fecha com os totais, categorizar 25 ou mais lançamentos de uma vez, cancelar parcelas futuras, desativar conta, substituir a análise do mês, trocar a pasta de dados e restaurar backup. A confirmação usa um código de uso único, válido por 10 minutos e só para os mesmos argumentos. |
| Nada é apagado | O conector não tem ferramenta de exclusão. Registros são desativados, cancelados ou resolvidos, e continuam no histórico. |
| Escolhas do usuário prevalecem | Sugestões automáticas nunca trocam uma categoria escolhida pelo usuário. |
| Cópia antes de cada alteração | O estado anterior a cada mudança é guardado (últimas 50), além de uma cópia diária (últimos 30 dias). |
| Histórico | Cada alteração é registrada com data, ação e o que mudou. |
| Desfazer | O assistente lista o histórico e os backups e restaura o ponto escolhido, com confirmação. A restauração também pode ser desfeita. |
| Documentos são dados | Instruções escritas dentro de documentos são ignoradas e apontadas ao usuário. |
| Arquivos | Leitura limitada a PDF, ZIP, CSV, TXT e OFX de até 30 MB, com limites contra arquivos compactados maliciosos. Planilhas nunca são sobrescritas. |

## Atualização e desinstalação

- **Atualizar:** em Personalizar → Plugins, atualize o Agente Financeiro, ou rode `claude plugin update agente-financeiro@agente-financeiro`.
- **Desinstalar:** a remoção do plugin não apaga a pasta de dados. Ao reinstalar, aponte a configuração para a mesma pasta e os dados são reaproveitados.

## Instruções para o assistente

Esta seção é destinada a um assistente de IA (por exemplo, Claude Code) que recebeu a tarefa de instalar o plugin no computador do usuário.

1. Verifique se o Node.js 18 ou superior está instalado com `node -v`. Se não estiver, siga [plugin/skills/agente-financeiro/references/instalacao-do-node.md](plugin/skills/agente-financeiro/references/instalacao-do-node.md): explique ao usuário o que será instalado e por quê, peça autorização, instale pelo gerenciador do sistema ou oriente a instalação manual. Não use `sudo`, não peça senhas e não altere as permissões do Claude por conta própria.
2. Registre o catálogo: `claude plugin marketplace add R-F-labs/agente-financeiro`.
3. Instale o plugin: `claude plugin install agente-financeiro@agente-financeiro`.
4. Peça ao usuário para reiniciar a sessão (ou o aplicativo) para carregar o conector.
5. Na nova sessão, chame a ferramenta `get_status` do conector `agente-financeiro`. Se `configured` for `false`, siga o roteiro da skill `agente-financeiro`: pergunte em qual pasta os dados devem ficar (sugira uma pasta sincronizada com a nuvem) e chame `setup_workspace`.
6. Continue a configuração (perfil, contas, categorias e metas) conversando com o usuário, uma etapa por vez.

Não peça senhas de banco, CPF ou números completos de conta ou cartão. A senha de um arquivo protegido só é usada quando o próprio usuário a informa para abrir aquele documento.

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
- Arquivos anexados na conversa do Cowork não ficam visíveis para o conector local. Arquivos protegidos devem ser salvos na pasta `entrada` (ou informados por caminho no Claude Code).
- O fechamento mensal acontece quando o usuário pede ao assistente; não há execução automática.
- Uso individual: um usuário por pasta de dados.

## Licença

Software proprietário. Todos os direitos reservados. Consulte [LICENSE](LICENSE).
