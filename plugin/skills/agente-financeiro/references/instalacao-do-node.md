# Conector indisponível: instalar o Node.js

O conector local `agente-financeiro` é um programa em Node.js que roda no computador do usuário. Sem o Node.js instalado, o conector não abre e as ferramentas (`get_status`, `setup_workspace` e as demais) não aparecem na conversa.

Siga este roteiro quando:

- a ferramenta `get_status` não existir na conversa;
- a chamada falhar com erro de conexão, "server not found", "spawn node ENOENT" ou "node não é reconhecido";
- o usuário disser que o plugin foi instalado mas "não aparece nada".

Não tente fazer o trabalho financeiro sem o conector: sem ele nada é guardado nem calculado.

## 1. Avise antes de qualquer coisa

Antes de rodar qualquer comando, explique ao usuário em poucas frases:

- **O que falta:** o Node.js, versão 18 ou superior (versão LTS, gratuita, da OpenJS Foundation).
- **Por que precisa:** é o "motor" do conector local. É ele que guarda os dados numa pasta do computador, confere os totais dos extratos e faz todas as contas. Sem ele, os dados teriam que sair do computador, e o plugin foi feito justamente para que isso não aconteça.
- **O que mais será baixado:** nada. O conector não tem dependências e não usa `npm install`; só o Node.js.
- **Quanto pesa e o que muda:** cerca de 30 a 80 MB, instalado como um programa comum, que pode ser removido pelo painel do sistema a qualquer momento.

Pergunte se pode seguir. Só continue com um "sim" claro.

## 2. Descubra onde você está

| Ambiente | Como reconhecer | Caminho |
|---|---|---|
| Claude Code (terminal, app de computador aba Code, extensão de IDE) | Você tem uma ferramenta de terminal (Bash ou PowerShell) | Seção 3: você mesmo verifica e instala, com a permissão do usuário |
| Cowork no aplicativo Claude | Não há terminal que rode no computador do usuário | Seção 4: oriente o usuário passo a passo |

## 3. Claude Code: verificar e instalar

1. Rode `node -v`.
   - Mostrou `v18` ou maior: o Node já está instalado. O problema é outro; vá para a seção 6.
   - Mostrou versão menor que 18: diga que será feita uma atualização e siga.
   - Deu erro ("não reconhecido", "command not found"): siga.
2. Proponha o comando do sistema do usuário e explique o que ele faz antes de rodar:

| Sistema | Verificar o instalador | Instalar |
|---|---|---|
| Windows 10/11 | `winget --version` | `winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements` |
| macOS com Homebrew | `brew --version` | `brew install node` |
| Ubuntu/Debian | `apt --version` | Pacote do sistema costuma ser antigo; prefira a seção 4 (instalador do site) ou peça ao usuário para rodar o comando com `sudo` ele mesmo |

3. O Claude Code vai mostrar um pedido de permissão para o comando. Diga ao usuário que é esse o comando que você explicou e que ele pode aprovar ou recusar.
4. Nunca use `sudo`, não peça a senha do computador e não rode scripts baixados da internet (`curl ... | sh`, `iwr ... | iex`). Se o instalador pedir senha de administrador ou uma janela de confirmação do sistema (UAC no Windows), avise o usuário que ela vai aparecer e que é ele quem aprova.
5. Depois da instalação, rode `node -v` de novo. No Windows, o terminal atual pode não enxergar o Node ainda: isso é normal e se resolve na reinicialização da seção 5.

Se qualquer passo falhar (sem `winget`, sem `brew`, erro de rede, política da empresa bloqueando), não insista em alternativas improvisadas: vá para a seção 4.

## 4. Orientar o usuário a instalar sozinho

Dê as instruções numeradas, uma ação por linha, no sistema dele. Pergunte o sistema se não souber.

**Windows**

1. Abra https://nodejs.org no navegador.
2. Clique no botão verde **LTS** (a versão recomendada). Será baixado um arquivo `.msi`.
3. Abra o arquivo baixado e clique em **Next** em todas as telas, mantendo as opções padrão. Não precisa marcar "Tools for Native Modules".
4. Se o Windows perguntar "Deseja permitir que este app faça alterações?", clique em **Sim**.
5. Ao terminar, feche e abra de novo o aplicativo Claude (ou o terminal do Claude Code).

**macOS**

1. Abra https://nodejs.org e baixe o instalador **LTS** (arquivo `.pkg`).
2. Abra o arquivo e siga as telas com as opções padrão. O Mac vai pedir a senha do computador: é o próprio macOS pedindo, digite lá, nunca na conversa.
3. Feche o aplicativo Claude por completo (Cmd+Q) e abra de novo.

**Linux**

1. Abra https://nodejs.org/pt/download e escolha o método indicado para a sua distribuição.
2. Depois, feche e abra o terminal ou o aplicativo Claude.

Para conferir: abra o Terminal (macOS/Linux) ou o PowerShell (Windows), digite `node -v` e pressione Enter. Deve aparecer algo como `v22.11.0`.

Problemas comuns:

| Sintoma | O que dizer |
|---|---|
| Computador da empresa bloqueia a instalação | Pedir ao suporte de TI para instalar o "Node.js LTS"; não tente contornar |
| `node -v` funciona, mas o plugin continua sem ferramentas | Reiniciar o aplicativo Claude por completo (fechar pela bandeja do sistema no Windows, Cmd+Q no macOS) |
| Versão menor que 18 aparece | Instalar a LTS pelo site por cima da antiga |

## 5. Reiniciar para carregar o conector

O conector só é aberto quando a sessão começa. Depois de instalar o Node:

- **Claude Code:** feche a sessão e abra uma nova (no Windows, feche também o terminal para ele enxergar o Node).
- **Aplicativo Claude (Cowork ou aba Code):** feche o aplicativo por completo e abra de novo.

Diga ao usuário que, na nova conversa, basta escrever **"Configurar meu Agente Financeiro"**. Lá, comece com `get_status`.

## 6. Node instalado e o conector ainda não abre

1. Confirme a versão com `node -v` (18 ou superior).
2. Confirme que o plugin está instalado e ativo (Claude Code: `claude plugin list`; aplicativo: Personalizar → Plugins).
3. No Claude Code, rode `claude mcp list` ou peça ao usuário para abrir o comando `/mcp` e ver o estado do `agente-financeiro` e a mensagem de erro.
4. Se a mensagem não for sobre o Node, mostre-a ao usuário e sugira abrir um chamado no repositório do plugin com essa mensagem (sem dados financeiros).

## 7. Oferecer mais autonomia (opcional)

Se a instalação travou só porque cada comando pede aprovação, ou se o usuário disser que prefere que você resolva sozinho, ofereça uma vez, sem insistir:

> "Se quiser, você pode me liberar para rodar sozinho os comandos de instalação e verificação do Node, sem pedir aprovação a cada um. Quem faz essa liberação é você, nas configurações do Claude; eu não mudo minhas próprias permissões."

Explique as opções da mais segura para a menos segura e recomende a primeira:

| Opção | O que libera | Como o usuário faz |
|---|---|---|
| Liberar só estes comandos (recomendado) | Apenas verificar e instalar o Node | Na janela de permissão do comando, escolher "Sim, e não perguntar de novo" para esse comando; ou adicionar ao `~/.claude/settings.json`, em `permissions.allow`, as regras abaixo |
| Aceitar edições automaticamente | Edição de arquivos sem perguntar; comandos continuam pedindo aprovação | No seletor de modo da conversa, escolher "Accept edits" |
| Modo automático ou sem confirmações | Quase tudo sem perguntar | Seletor de modo da conversa. Não recomende para uso com dados financeiros; se o usuário escolher, sugira voltar ao modo normal depois da instalação |

Regras para a primeira opção, conforme o sistema:

```json
{
  "permissions": {
    "allow": [
      "Bash(node -v)",
      "Bash(winget --version)",
      "Bash(winget install --id OpenJS.NodeJS.LTS *)",
      "PowerShell(node -v)",
      "PowerShell(winget --version)",
      "PowerShell(winget install --id OpenJS.NodeJS.LTS *)",
      "Bash(brew --version)",
      "Bash(brew install node)"
    ]
  }
}
```

Regras desta seção:

- Nunca edite você mesmo arquivos de permissão nem troque o modo da conversa. Mostre ao usuário como fazer e espere ele dizer que fez.
- A liberação vale só para o Node. Ela não muda as confirmações do conector (registro forçado, categorização em massa, restauração de backup): essas continuam pedindo o "sim" do usuário sempre.
- Mesmo com autonomia, continue avisando o que vai rodar antes de rodar e mostre o resultado.
- Se o usuário recusar, siga pela seção 4 sem voltar ao assunto.
