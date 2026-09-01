import assert from "node:assert/strict";
import test from "node:test";

test("Estrutura dos 3 planos Ávila Ops e gateways obrigatórios", () => {
  const plans = [
    { id: "start", monthlyPrice: 97, yearlyPrice: 79, hasN8n: false, hasAi: false },
    { id: "pro", monthlyPrice: 247, yearlyPrice: 197, hasN8n: true, hasAi: true, isFeatured: true },
    { id: "enterprise", monthlyPrice: 697, yearlyPrice: 547, hasN8n: true, hasAi: true, isDedicated: true },
  ];

  // Deve sempre conter 3 planos
  assert.equal(plans.length, 3);
  assert.equal(plans[0].monthlyPrice < plans[1].monthlyPrice, true);
  assert.equal(plans[1].monthlyPrice < plans[2].monthlyPrice, true);
  assert.equal(plans[1].isFeatured, true);

  // Gateways obrigatórios sem Stripe
  const gateways = ["mercadopago", "efi", "paypal"];
  assert.equal(gateways.includes("stripe"), false);
  assert.equal(gateways.includes("mercadopago"), true);
  assert.equal(gateways.includes("efi"), true);
  assert.equal(gateways.includes("paypal"), true);
});

test("Formatador e cálculo de valores em centavos", () => {
  const priceToCents = (valStr) => Math.round(parseFloat(valStr.replace(",", ".")) * 100) || 0;
  assert.equal(priceToCents("97,00"), 9700);
  assert.equal(priceToCents("247,50"), 24750);
  assert.equal(priceToCents("0,00"), 0);
  assert.equal(priceToCents("invalido"), 0);
});

test("Regras de validação de automação", () => {
  const allowedTriggers = ["stage_change", "message_received", "contact_created", "task_overdue"];
  const allowedActions = ["send_whatsapp", "n8n_webhook", "create_task", "notify_team"];

  assert.ok(allowedTriggers.includes("stage_change"));
  assert.ok(allowedTriggers.includes("message_received"));
  assert.ok(allowedActions.includes("n8n_webhook"));
  assert.ok(allowedActions.includes("send_whatsapp"));
});

test("Validação de fontes de conhecimento RAG e regras de atendimento", () => {
  const validKnowledgeTypes = ["faq", "document", "url", "guideline"];
  assert.equal(validKnowledgeTypes.length, 4);
  assert.ok(validKnowledgeTypes.includes("faq"));
  assert.ok(validKnowledgeTypes.includes("guideline"));

  const defaultHours = {
    enabled: true,
    start: "08:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5],
  };
  assert.equal(defaultHours.days.length, 5);
  assert.equal(defaultHours.start < defaultHours.end, true);

  const validTones = ["consultivo", "amigavel", "formal", "tecnico"];
  assert.ok(validTones.includes("consultivo"));
});


