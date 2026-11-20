# Privacidade e segurança

## Onde ficam os dados

- Todos os dados financeiros ficam na pasta escolhida pelo usuário, no computador dele. O plugin não tem servidor próprio e não envia dados a terceiros.
- Os PDFs não são copiados pelo plugin: o assistente lê o arquivo anexado na conversa e envia ao conector apenas os lançamentos e totais extraídos.
- As únicas consultas externas do conector são públicas e não contêm dados do usuário: indicadores do Banco Central e cotações da brapi.dev (apenas os tickers da carteira).

## O que o assistente vê

A leitura dos documentos e a análise acontecem no Claude do usuário, sujeitas aos termos e às configurações de privacidade da conta dele. Recomende ao cliente revisar essas configurações.

## Boas práticas para o usuário

- Manter a pasta de dados dentro de um serviço de nuvem com autenticação em dois fatores (Google Drive, OneDrive ou iCloud) para ter cópia de segurança.
- Não compartilhar a pasta de dados.
- O arquivo `dados/agente-financeiro.json` não deve ser editado manualmente; use as ferramentas ou peça ao assistente.

## Dados mínimos

- Contas e cartões guardam apenas os 4 últimos dígitos.
- Nenhum CPF, senha, número completo de conta ou cartão é solicitado ou armazenado.
- PDFs protegidos por senha devem ser desbloqueados pelo próprio usuário antes de anexar; o plugin não pede nem guarda senhas.

## Limites

O Agente Financeiro é uma ferramenta de apoio à decisão. Não executa operações financeiras e não substitui assessoria de investimentos de profissional certificado.
