# Encontro com Deus — Painel e Recepção

App web (roda no **GitHub Pages**, instalável no celular) com banco de dados no **Firebase (Firestore)**:
todos os celulares da recepção trabalham juntos, **ao vivo**, e continuam funcionando sem internet.

**Endereço:** https://svictorazevedo.github.io/encontro-com-deus/

## Como usar

1. **Responsável:** em Ajustes → **Criar evento com a planilha**, escolha o `.xlsx` ou `.csv` exportado do site de ingressos.
   Os inscritos vão para o banco e o app mostra o **código do evento** (ex.: `ABCD-EFGH-JKLM-NPQR`).
2. **Enviar acesso para a equipe**: manda o link com o código (WhatsApp etc.). Quem abrir o link, ou digitar o código, entra.
3. Todos fazem check-in, recebem pagamentos, cadastram e alocam quartos; tudo aparece na hora nos outros celulares.
4. **Atualizar inscritos com planilha nova**: importe de novo o arquivo do site. Entram os novos e os dados do site são
   atualizados; check-ins, pagamentos na recepção, quartos e cadastros da recepção **não são alterados**.
5. **Baixar planilha (.xlsx)**: a qualquer momento, com tudo o que foi feito (aba de inscritos + aba Quartos).

Sem internet, as ações ficam guardadas no aparelho e são enviadas sozinhas quando a conexão volta.

## Banco (Firebase)

- Projeto `encontro-com-deus-7dd79` (plano gratuito Spark), Firestore em `southamerica-east1` (São Paulo),
  login **anônimo** (com limpeza automática de contas com mais de 30 dias).
- Estrutura: `eventos/{CÓDIGO}` (nome, `cabPessoas`, `cabQuartos`) com as subcoleções `pessoas` e `quartos`;
  cada linha é `{ o: ordem, v: { c0, c1, … } }`, onde `cN` é a coluna `N` de `cabPessoas`/`cabQuartos`.
- Regras em [firestore.rules](firestore.rules) (publicadas no console): só entra quem sabe o código; não dá para listar eventos.
- O código tem 16 caracteres aleatórios (cerca de 80 bits): ele **é** a senha do evento. Quem tem o código vê telefones e
  dados de saúde. Envie só para a equipe.

Outras opções (em Ajustes → Outras opções): abrir a planilha só no aparelho, sem banco; e o antigo **modo Google**
(planilha + Apps Script, [apps-script/Codigo.gs](apps-script/Codigo.gs)).

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

## Só neste aparelho (sem banco)

Em **Ajustes → Outras opções → Abrir planilha só neste aparelho**, escolha o `.xlsx` ou `.csv` exportado do site de ingressos. Pronto: sem Google, sem script.

- Tudo o que é feito (check-in, pagamento, quarto, cadastro) fica salvo **naquele aparelho**, mesmo sem internet.
- **Baixar planilha atualizada (.xlsx)**: gera a planilha com tudo o que foi feito (aba de inscritos + aba Quartos). No celular abre o compartilhar (WhatsApp, Drive…).
- **Abrir arquivo novo → Juntar**: usa o arquivo novo e mantém o que foi feito no aparelho (pelo Código). Serve para pegar
  inscrições novas do site ou para juntar a planilha baixada de outro celular.
- Se colarem o link de uma Planilha Google, o app explica como baixá-la como .xlsx.


## Modo Google (antigo: planilha + Apps Script)

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

- **3.1.3**: importação casa pelo código do ingresso **ou** pelo nome (planilha sem código não duplica quem veio do site); reconhece coluna "Pagamento".
- **3.1.2**: reconhece a exportação de ingressos com "Ingresso" (código), "Situação", "Contato (celular)" e "Qual igreja".
- **3.1.1**: reconhece planilhas de outros sites (Participante, Lote, Forma de pagamento, Situação, batizado 1/0, Observação);
  importação casa as pessoas pelo nome reconhecido e as colunas equivalentes (não duplica mais); números do Excel sem ".0"/notação científica.
- **3.1.0**: campo **Observação** no cadastro e na ficha (editável, com botão de data de hoje), para pagamentos parciais e recados;
  aparece como selo 📝 na lista e entra na busca. Coluna `Observação (recepção)`.
- **3.0.0**: banco no Firebase (ao vivo entre celulares, offline): criar evento com a planilha, entrar com código,
  atualizar inscritos sem perder o que a recepção fez, baixar .xlsx.
- **2.2.0**: abrir a planilha direto do arquivo (.xlsx/.csv), sem Google; baixar planilha atualizada (.xlsx); juntar arquivo novo ou de outro celular.
- **2.1.1**: colar o link da planilha (ou do script) em "Conectar" mostra o passo a passo de instalação em vez de "link inválido".
- **2.1.0**: alocação de quartos (tela Quartos, distribuição automática, quarto no check-in, na ficha, no cadastro
  e no painel). Apps Script ganhou `atualizarVarios` (gravação em lote), `garantirAba` e leitura de abas extras.

- **2.0.0**: visual de aplicativo (barra inferior, folhas deslizantes, check-in com um toque e "Desfazer"),
  PWA instalável, fila offline, ficha da pessoa (Ligar/WhatsApp/saúde), link de conexão. O Apps Script passa a ficar
  preso à planilha, com menu próprio, chave automática e geração do link.
- **1.0.0**: Painel, Recepção (check-in, pagamento, cadastro), Configuração, modo demonstração.
