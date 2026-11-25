# Privacidade e segurança

## Onde ficam os dados

- Todos os dados financeiros ficam na pasta escolhida pelo usuário, no computador dele. O plugin não tem servidor próprio e não envia dados a terceiros.
- Os documentos não são copiados para a base: o conector guarda apenas os lançamentos, os totais e o nome do arquivo. O arquivo original fica onde o usuário o deixou (por exemplo, na pasta `entrada`).
- As únicas consultas externas do conector são públicas e não contêm dados do usuário: indicadores do Banco Central, cotações da brapi.dev (apenas os tickers da carteira) e o cadastro público de empresas da BrasilAPI (apenas o CNPJ da empresa pesquisada, quando a ferramenta `lookup_counterparty` é usada). CPF de pessoas nunca é enviado a nenhum serviço e aparece mascarado (`***.456.789-**`) nas respostas das ferramentas.

## O que o assistente vê

A leitura dos documentos e a análise acontecem no Claude do usuário, sujeitas aos termos e às configurações de privacidade da conta dele. Recomende ao cliente revisar essas configurações.

## Boas práticas para o usuário

- Manter a pasta de dados dentro de um serviço de nuvem com autenticação em dois fatores (Google Drive, OneDrive ou iCloud) para ter cópia de segurança.
- Não compartilhar a pasta de dados.
- O arquivo `dados/agente-financeiro.json` não deve ser editado manualmente; use as ferramentas ou peça ao assistente.

## Dados mínimos

- Contas e cartões guardam apenas os 4 últimos dígitos.
- Nenhum CPF, número completo de conta ou cartão é solicitado ou armazenado.

## Arquivos protegidos por senha

- O usuário informa a senha do arquivo na própria conversa. O assistente a repassa apenas à ferramenta `read_document_file`.
- O conector usa a senha em memória, durante a leitura, e a descarta em seguida. Ela não é gravada em configuração, base de dados, histórico ou log.
- Nenhuma cópia desprotegida do documento é gravada em disco.
- O assistente é instruído a não repetir a senha nas respostas e a nunca tentar adivinhar senhas.
- A senha passa pela conversa com o Claude, sujeita aos termos da conta do usuário. Quem preferir pode desbloquear o arquivo por conta própria antes de enviar.

### Algoritmos antigos exigidos pelos formatos

Alguns algoritmos usados na leitura são considerados fracos, mas são os que os próprios formatos definem. Trocá-los impediria a leitura dos arquivos que os bancos ainda emitem. Nenhum deles é usado para proteger dados do plugin.

| Onde | Algoritmo | Por que é assim |
|---|---|---|
| `plugin/server/src/reader/pdf/security.js` | MD5 e RC4 na derivação da chave de PDFs revisão 2 a 4 | É o handler de segurança padrão definido na norma do PDF (ISO 32000-1, 7.6.3). A senha não é guardada: a derivação só abre o arquivo em memória. PDFs AES-256 (revisão 6) usam SHA-256/384/512, como a norma exige. |
| `plugin/server/scripts/build-reader-fixtures.py` | PBKDF2-SHA1 com 1000 iterações e AES em modo ECB | Gera os arquivos de teste no formato WinZip AES, que fixa esses parâmetros. O ECB só cifra o contador para montar o modo CTR little-endian da especificação. O script não faz parte do plugin instalado. |

Os alertas do code scanning (CodeQL) para esses trechos foram dispensados no GitHub com esta justificativa.

## Proteção contra alterações indevidas

- Ações sensíveis exigem confirmação do usuário por meio de um código de uso único ligado aos argumentos exatos da ação (detalhes em `arquitetura.md`, seção Guardrails).
- O conector não tem ferramenta de exclusão.
- O estado anterior a cada alteração é guardado (últimas 50), há cópia diária (30 dias) e histórico de mudanças. Qualquer alteração pode ser desfeita.
- Texto de documentos é tratado como dado: instruções escritas dentro de PDFs ou CSVs não são seguidas.
- A leitura de arquivos aceita apenas PDF, ZIP, CSV, TXT e OFX de até 30 MB; arquivos compactados têm limite de itens e de tamanho descompactado.

## Limites

O Agente Financeiro é uma ferramenta de apoio à decisão. Não executa operações financeiras e não substitui assessoria de investimentos de profissional certificado.
