import assert from "node:assert/strict";
import test from "node:test";

const { buildEntries, guessMapping, normalizeEmail, normalizePhone, parseContactFile, parseCsv, parseVcard, phoneKey } = await import("../../dist-server/contact-import.js");

test("telefone brasileiro vira E.164 em qualquer formato que a pessoa digita", () => {
  for (const entrada of ["(16) 99234-0000", "16992340000", "016 99234 0000", "+55 16 99234-0000", "5516992340000", "0055 16 99234-0000"]) {
    assert.equal(normalizePhone(entrada), "+5516992340000", entrada);
  }
});

test("celular antigo ganha o nono dígito; fixo fica como está", () => {
  assert.equal(normalizePhone("(16) 9234-0000"), "+5516992340000");
  assert.equal(normalizePhone("551692340000"), "+5516992340000");
  assert.equal(normalizePhone("(16) 3333-0000"), "+551633330000");
});

test("número de fora mantém o código do país; lixo vira nulo", () => {
  assert.equal(normalizePhone("+1 (555) 147-4741"), "+15551474741");
  assert.equal(normalizePhone("+351 912 345 678"), "+351912345678");
  for (const entrada of ["", null, "ramal 12", "1234", "999999999999999999", "+12"]) assert.equal(normalizePhone(entrada), null, String(entrada));
});

test("a chave de comparação é a mesma para formatos diferentes do mesmo número", () => {
  assert.equal(phoneKey("+55 16 99234-0000"), "5516992340000");
  assert.equal(phoneKey("5516992340000"), phoneKey("(16) 9234-0000"));
  assert.equal(phoneKey("sem telefone"), null);
});

test("e-mail em minúsculas, sem espaço; inválido vira nulo", () => {
  assert.equal(normalizeEmail("  Maria@Loja.COM.br "), "maria@loja.com.br");
  assert.equal(normalizeEmail("mailto:joao@x.io"), "joao@x.io");
  for (const entrada of ["maria@", "sem arroba", "", null, "a b@c.com"]) assert.equal(normalizeEmail(entrada), null, String(entrada));
});

test("CSV do Excel brasileiro: ponto e vírgula, BOM, aspas e quebra de linha no campo", () => {
  const linhas = parseCsv('﻿Nome;Telefone;Obs\r\n"Silva; Maria";(16) 99234-0000;"linha 1\nlinha 2"\r\n\r\nJoão "Zé";1633330000;\r\n');
  assert.deepEqual(linhas, [
    ["Nome", "Telefone", "Obs"],
    ["Silva; Maria", "(16) 99234-0000", "linha 1\nlinha 2"],
    ['João "Zé"', "1633330000", ""],
  ]);
  assert.deepEqual(parseCsv('a,b\n"x ""y""",2'), [["a", "b"], ['x "y"', "2"]]);
});

test("vCard do Google, do iPhone e 2.1 com quoted-printable", () => {
  const vcf = [
    "BEGIN:VCARD", "VERSION:3.0", "FN:Maria Souza", "N:Souza;Maria;;;", "TEL;TYPE=CELL:+55 16 99234-0000", "TEL;TYPE=HOME:1633330000",
    "EMAIL;TYPE=INTERNET:Maria@Loja.com", "ORG:Loja da Maria;Vendas", "CATEGORIES:Clientes,VIP", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "N:Lima;João;;;", "item1.TEL;type=pref:(11) 98888-7777", "item1.X-ABLabel:trabalho", "END:VCARD",
    "BEGIN:VCARD", "VERSION:2.1", "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o da Silva", "TEL;CELL:16991112222", "NOTE:texto longo que", " continua na outra linha", "END:VCARD",
  ].join("\r\n");
  assert.deepEqual(parseVcard(vcf), [
    ["Maria Souza", "+55 16 99234-0000", "Maria@Loja.com", "Loja da Maria", "Clientes,VIP"],
    ["João Lima", "(11) 98888-7777", "", "", ""],
    ["João da Silva", "16991112222", "", "", ""],
  ]);
});

test("as colunas são reconhecidas pelo nome, com e sem acento", () => {
  assert.deepEqual(guessMapping(["Nome completo", "Celular", "E-mail", "Empresa", "Etiquetas", "Cidade"]), { name: 0, phone: 1, email: 2, company: 3, tags: 4 });
  assert.deepEqual(guessMapping(["First Name", "Phone 1 - Value", "E-mail 1 - Value", "Organization Name", "Labels"]), { name: 0, phone: 1, email: 2, company: 3, tags: 4 });
  assert.deepEqual(guessMapping(["codigo", "valor"]), {});
});

test("monta os contatos, junta os repetidos do arquivo e explica o que ficou de fora", () => {
  const arquivo = parseContactFile(
    "clientes.csv",
    ["Nome,Telefone,Email,Empresa,Tags", "Maria,(16) 99234-0000,,Loja,vip", "Maria S.,5516992340000,maria@loja.com,,atacado; VIP", ",,joao@x.io,,", "Sem Contato,,,,", "Fone Ruim,123,,,", "Mail Ruim,,ruim@,,"].join("\n"),
  );
  assert.equal(arquivo.kind, "csv");
  const { entries, rejected, repeatedInFile } = buildEntries(arquivo, guessMapping(arquivo.columns));
  assert.deepEqual(entries, [
    { line: 2, name: "Maria", phone: "+5516992340000", email: "maria@loja.com", company: "Loja", tags: ["vip", "atacado"] },
    { line: 4, name: "joao@x.io", phone: null, email: "joao@x.io", company: null, tags: [] },
  ]);
  assert.equal(repeatedInFile, 1);
  assert.deepEqual(rejected.map((item) => [item.line, item.reason]), [[5, "Sem telefone e sem e-mail"], [6, "Telefone inválido"], [7, "E-mail inválido"]]);
});

test("arquivo .vcf é lido como vCard mesmo sem olhar o conteúdo, e vice-versa", () => {
  const arquivo = parseContactFile("agenda.txt", "BEGIN:VCARD\nFN:Ana\nTEL:16992340000\nEND:VCARD\n");
  assert.equal(arquivo.kind, "vcard");
  assert.deepEqual(buildEntries(arquivo, guessMapping(arquivo.columns)).entries, [{ line: 1, name: "Ana", phone: "+5516992340000", email: null, company: null, tags: [] }]);
});
