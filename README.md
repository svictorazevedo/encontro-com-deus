# Encontro com Deus — Painel e Recepção

App web (roda no **GitHub Pages**, instalável no celular) cujo banco de dados é uma **planilha Google** no Drive.
Um Apps Script instalado na própria planilha ([apps-script/Codigo.gs](apps-script/Codigo.gs)) faz a ponte.

**Endereço:** https://svictorazevedo.github.io/encontro-com-deus/

## Telas

- **Recepção**: busca instantânea (nome, código, celular, líder) e check-in com um toque. Se a pessoa não pagou,
  oferece receber na hora. Mostra uma confirmação grande e um botão "Desfazer" por alguns segundos.
  Tocar numa pessoa abre a ficha: dados, saúde em destaque, Ligar, WhatsApp, receber pagamento e desfazer check-in.
  Filtros com contagem: sem check-in, presentes, não pagos, encontristas, equipe, anjos e saúde.
- **Cadastrar** (botão +): encontrista, equipe ou anjo, com pagamento e check-in na hora.
- **Painel**: presença (anel), encontristas, equipe, anjos, pagos e não pagos (com lista), pagos no app e na recepção
  (com o total recebido), batizados e não batizados, quantidade por líder de célula e por discipulado.
  Variações do mesmo nome são agrupadas: acentos, maiúsculas, "Pr.", "Obr." etc.
  Cada número leva à lista correspondente.
- **Quartos**: mapa do local por andar e ala (24 quartos + colchões avulsos + cozinha = 336 vagas), com
  ocupação de cada quarto e vagas por sexo. Tocar num quarto mostra quem está nele e permite adicionar
  (com busca e seleção múltipla), tirar pessoas e editar camas, sexo e observação.
  **Distribuir automaticamente** coloca quem está sem quarto nas vagas livres:
  - respeita o sexo do quarto;
  - mantém o discipulado ou a célula juntos (configurável), com opção de separar equipe de encontristas;
  - usa os quartos mistos e os colchões avulsos só depois; deixa a Cozinha de fora;
  - mostra uma prévia antes e oferece "Desfazer".
  Na recepção, o check-in já mostra o quarto ("Bem-vinda, Ana! · Quarto 03") e a ficha tem "Escolher/Trocar quarto".
- **Ajustes**: conectar o aparelho (link de conexão), nome do aparelho/atendente, enviar o acesso para outro
  celular, instalar como app, configuração avançada (colunas, aba, valor do ingresso).

## Pensado para o celular

- Instalável (PWA): ícone na tela inicial, abre em tela cheia, abre mesmo sem internet.
- **Funciona com internet ruim:** cada ação aparece na hora e vai para uma fila que envia à planilha quando dá.
  O status no topo mostra se está sincronizado, enviando ou sem internet.
- Atualiza sozinho a cada 30 s, para ver o trabalho das outras mesas e as novas compras no app.
- No PC vira layout de site, com navegação no topo e a lista em grade.

## Jeito mais simples: abrir o arquivo

Em **Ajustes → Abrir planilha**, escolha o `.xlsx` ou `.csv` exportado do site de ingressos. Pronto: sem Google, sem script.

- Tudo o que é feito (check-in, pagamento, quarto, cadastro) fica salvo **naquele aparelho**, mesmo sem internet.
- **Baixar planilha atualizada (.xlsx)**: gera a planilha com tudo o que foi feito (aba de inscritos + aba Quartos). No celular abre o compartilhar (WhatsApp, Drive…).
- **Abrir arquivo novo → Juntar**: usa o arquivo novo e mantém o que foi feito no aparelho (pelo Código). Serve para pegar
  inscrições novas do site ou para juntar a planilha baixada de outro celular.
- Se colarem o link de uma Planilha Google, o app explica como baixá-la como .xlsx.

Para vários celulares vendo a **mesma** planilha ao vivo, use o modo Google abaixo.

## Modo Google (vários celulares sincronizados)

1. Planilha: envie o `.xlsx` exportado ao Google Drive e abra como Planilhas Google.
2. Na planilha, abra **Extensões → Apps Script**, cole `apps-script/Codigo.gs` e salve.
3. **Implantar → Nova implantação → App da Web** (Executar como: *Eu*; Quem pode acessar: *Qualquer pessoa*) → autorize.
4. Recarregue a planilha. No menu **Encontro com Deus → Conectar celulares**, copie ou envie por WhatsApp o
   **link de conexão** e abra-o em cada aparelho da recepção.

A chave de acesso é gerada sozinha. Para cortar o acesso de todos os aparelhos, use
**Encontro com Deus → Trocar chave de acesso** e envie o novo link.

## Regras de contagem

| Indicador | Regra |
|---|---|
| Encontrista / Equipe / Anjo | coluna **Tipo** contém "Encontrista", "Equipe" ou "Anjo" |
| Pago | **Status** = Pago/Aprovado, ou pagamento registrado na recepção |
| Pago na recepção | coluna *Pago na recepção* preenchida, ou **Método** contém um termo configurado (padrão: Externo, Manual, Dinheiro) |
| Pago no app | pago e não é recepção |
| Batizado | resposta começa com "Sim" |
| Presente | coluna *Check-in* = Sim, ou **Usado** = Usado |
| Saúde ⚕ | medicamento, alergia ou restrição alimentar preenchidos com algo diferente de "não" |
| Cancelado | Status cancelado/estornado/reembolsado: fica fora de todas as contas |

## O que o app grava na planilha

Colunas criadas no fim: `Check-in`, `Check-in em`, `Check-in por`, `Pago na recepção`, `Valor recepção`,
`Pago na recepção em`, `Cadastrado na recepção por`. No check-in, a coluna **Usado** recebe "Usado".
No pagamento, **Status** recebe "Pago". Cadastros feitos na recepção têm código começando com `R` e Tipo `… | Recepção`.

## Segurança

O link de conexão dá acesso aos dados dos inscritos (telefones e saúde). Envie só para a equipe.
Cada aparelho guarda uma cópia dos dados para funcionar offline. Ao final do evento, use **Ajustes → Desconectar**.

## Aba "Quartos"

O app cria na planilha a aba **Quartos** (`Quarto`, `Andar`, `Ala`, `Camas`, `Sexo`, `Observação`) com o mapa padrão.
Pode ser editada direto na planilha. Sexo vazio = misto. O quarto de cada pessoa fica na coluna **Quarto** da aba de inscritos.

## Versões

- **2.2.0**: abrir a planilha direto do arquivo (.xlsx/.csv), sem Google; baixar planilha atualizada (.xlsx); juntar arquivo novo ou de outro celular.
- **2.1.1**: colar o link da planilha (ou do script) em "Conectar" mostra o passo a passo de instalação em vez de "link inválido".
- **2.1.0**: alocação de quartos (tela Quartos, distribuição automática, quarto no check-in, na ficha, no cadastro
  e no painel). Apps Script ganhou `atualizarVarios` (gravação em lote), `garantirAba` e leitura de abas extras.

- **2.0.0**: visual de aplicativo (barra inferior, folhas deslizantes, check-in com um toque e "Desfazer"),
  PWA instalável, fila offline, ficha da pessoa (Ligar/WhatsApp/saúde), link de conexão. O Apps Script passa a ficar
  preso à planilha, com menu próprio, chave automática e geração do link.
- **1.0.0**: Painel, Recepção (check-in, pagamento, cadastro), Configuração, modo demonstração.
