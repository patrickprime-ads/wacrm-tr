const fs = require("fs");
const path = require("path");

const ignorarPastas = ["node_modules", ".next", ".git"];

const traducoes = {
  "CRM Template for WhatsApp": "CRM para WhatsApp",
  "Dashboard": "Painel",

  "Conversations Over Time": "Conversas ao Longo do Tempo",
  "Daily message volume by direction": "Volume diário de mensagens por direção",
  "7 days": "7 dias",
  "30 days": "30 dias",
  "90 days": "90 dias",

  "No message activity in this range": "Nenhuma atividade de mensagens neste período",
  "Send or receive messages to start populating this chart.": "Envie ou receba mensagens para começar a preencher este gráfico.",
  "Incoming": "Recebidas",
  "Outgoing": "Enviadas",

  "Pipeline Value": "Valor do Funil",
  "Open deals by stage": "Negócios abertos por etapa",
  "No open deals yet": "Nenhum negócio aberto ainda",
  "Create deals in Pipelines to see stage breakdowns here.": "Crie negócios em Funis de Venda para ver o detalhamento por etapa aqui.",

  "Average First Response Time": "Tempo Médio da Primeira Resposta",
  "Minutes to reply to a customer's first unreplied message, by weekday": "Minutos para responder à primeira mensagem não respondida de um cliente, por dia da semana",
  "target 5m": "meta 5 min",

  "No replies recorded yet": "Nenhuma resposta registrada ainda",
  "This chart fills in as you reply to customer messages.": "Este gráfico será preenchido conforme você responder às mensagens dos clientes.",

  "Recent Activity": "Atividade Recente",
  "View all": "Ver tudo",
  "No activity yet": "Nenhuma atividade ainda",

  "New Contact": "Novo Contato",
  "New Deal": "Novo Negócio",
  "New Broadcast": "Nova Transmissão",
  "New Automation": "Nova Automação",

  "Contacts": "Contatos",
  "Inbox": "Caixa de Entrada",
  "Pipelines": "Funis de Venda",
  "Broadcasts": "Transmissões",
  "Automations": "Automações",
  "Flows": "Fluxos",
  "Settings": "Configurações",

  "Active Conversations": "Conversas Ativas",
  "New Contacts": "Novos Contatos",
  "Today": "Hoje",
  "Open Deals": "Negócios Abertos",
  "Messages": "Mensagens",
  "Sent Today": "Enviadas Hoje",

  "No change vs yesterday": "Sem alteração vs ontem",
  "No open deals": "Nenhum negócio aberto",

  "Caixa de Entrada": "Caixa de Entrada",
  "Funis de Venda": "Funis de Venda",
  "Transmissões": "Transmissões",
  "Automações": "Automações",
  "Configurações": "Configurações",
};

function traduzirArquivo(caminhoArquivo) {
  let conteudo = fs.readFileSync(caminhoArquivo, "utf8");
  const original = conteudo;

  for (const [ingles, portugues] of Object.entries(traducoes)) {
    conteudo = conteudo.split(ingles).join(portugues);
  }

  if (conteudo !== original) {
    fs.writeFileSync(caminhoArquivo, conteudo, "utf8");
    console.log("Traduzido:", caminhoArquivo);
  }
}

function percorrer(pasta) {
  const itens = fs.readdirSync(pasta);

  for (const item of itens) {
    const caminho = path.join(pasta, item);
    const stat = fs.statSync(caminho);

    if (stat.isDirectory()) {
      if (!ignorarPastas.includes(item)) {
        percorrer(caminho);
      }
    } else {
      const extensoesPermitidas = [".tsx", ".ts", ".jsx", ".js", ".json"];
      const ext = path.extname(caminho);

      if (extensoesPermitidas.includes(ext)) {
        traduzirArquivo(caminho);
      }
    }
  }
}

percorrer(__dirname);

console.log("Tradução finalizada!");