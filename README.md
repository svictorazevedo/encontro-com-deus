# Encontro com Deus — Painel e Recepção

Site estático (roda no **GitHub Pages**) cujo banco de dados é uma **planilha Google** no Drive.
Uma pequena "ponte" em Google Apps Script ([apps-script/Codigo.gs](apps-script/Codigo.gs)) lê e grava na planilha.

## Telas

- **Painel** — encontristas, equipe, anjos, presentes; pagos / não pagos (com lista de nomes);
  pagos no app / pagos na recepção; batizados / não batizados; quantidade por líder de célula e por discipulado
  (variações do mesmo nome são agrupadas: acentos, maiúsculas, "Pr.", "Obr." etc.). Atualiza sozinho a cada 45 s.
- **Recepção** — busca por nome, código, celular ou líder; check-in (Enter faz check-in quando só sobra 1 resultado);
  receber pagamento (dinheiro, PIX, cartão); desfazer check-in/pagamento; cadastrar encontrista/equipe/anjo na hora;
  detalhes (medicamento, alergia, restrição alimentar, contato de emergência).
- **Configuração** — link da planilha, aba, URL do Apps Script, chave, nome do atendente, valor padrão,
  mapeamento de colunas e modo demonstração.

## Como colocar no ar

1. **Planilha**: envie o `.xlsx` exportado para o Google Drive e abra como Planilhas Google
   (Arquivo → Salvar como Planilhas Google).
2. **Apps Script**: em [script.google.com](https://script.google.com) → Novo projeto → cole `apps-script/Codigo.gs`,
   troque `TROQUE-ESTA-CHAVE` por uma senha → Implantar → Nova implantação → **App da Web**
   (Executar como: *Eu*; Quem pode acessar: *Qualquer pessoa*) → copie a URL `/exec`.
3. **Site**: publique este repositório no GitHub Pages (Settings → Pages → branch `main`, pasta `/`).
4. Abra o site → **Configuração** → cole o link da planilha, a URL do Apps Script e a chave → *Salvar e testar*.
   Faça isso em cada celular/computador da recepção (a configuração fica salva no navegador).

## Regras de contagem

| Indicador | Regra |
|---|---|
| Encontrista / Equipe / Anjo | coluna **Tipo** contém "Encontrista", "Equipe" ou "Anjo" |
| Pago | **Status** = Pago/Aprovado, ou pagamento registrado na recepção |
| Pago na recepção | coluna *Pago na recepção* preenchida, ou **Método de pagamento** contém um dos termos configurados (padrão: Externo, Manual, Dinheiro) |
| Pago no app | pago e não é recepção |
| Batizado | resposta começa com "Sim" |
| Presente | coluna *Check-in* = Sim, ou **Usado** = Usado |
| Cancelado | Status com cancelado/estornado/reembolsado — fica fora de todas as contas |

## Colunas criadas pelo sistema

Na primeira gravação o sistema acrescenta no fim da planilha: `Check-in`, `Check-in em`, `Check-in por`,
`Pago na recepção`, `Valor recepção`, `Pago na recepção em`, `Cadastrado na recepção por`.
No check-in também marca a coluna **Usado** como "Usado"; no pagamento muda **Status** para "Pago".
Cadastros feitos na recepção recebem código começando com `R` e Tipo `… | Recepção`.

## Segurança

A URL do Apps Script + a chave dão acesso aos dados (incluindo telefones e informações de saúde).
Compartilhe só com a equipe da recepção. Para trocar a chave, altere `CHAVE_PADRAO` (ou a propriedade
do script `CHAVE`) e publique nova versão da implantação.

## Versões

- **1.0.0** — Painel, Recepção (check-in, pagamento, cadastro), Configuração, modo demonstração.
