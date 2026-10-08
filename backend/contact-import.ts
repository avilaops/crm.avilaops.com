/**
 * Importação de contatos por arquivo (CSV e vCard): a parte que não toca o
 * banco. Ler o arquivo, adivinhar as colunas, normalizar telefone e e-mail e
 * dizer por que uma linha ficou de fora.
 *
 * Fica separada das rotas para ser testada sem Postgres: é aqui que mora o
 * risco de importar 10 mil telefones no formato errado.
 */

export type ImportField = "name" | "phone" | "email" | "company" | "tags";
export type ImportMapping = Partial<Record<ImportField, number>>;
export const IMPORT_FIELDS: ImportField[] = ["name", "phone", "email", "company", "tags"];

export type ParsedFile = {
  kind: "csv" | "vcard";
  /** Cabeçalho do CSV; no vCard, os campos fixos que o arquivo traz. */
  columns: string[];
  rows: string[][];
};

export type ImportEntry = {
  /** Linha no arquivo (CSV) ou ordem do cartão (vCard), a partir de 1. */
  line: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
};

export type ImportRejection = { line: number; reason: string; raw: string };

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Telefone em E.164.
 *
 * Sem código de país, o número é tratado como brasileiro. Celular antigo de
 * oito dígitos ganha o nono: os contatos do WhatsApp chegam com ele, e sem isso
 * a mesma pessoa viraria dois cadastros. Fixo (começa em 2 a 5) fica como está.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const texto = raw.trim();
  if (!texto) return null;
  const internacional = texto.startsWith("+") || texto.startsWith("00");
  let digitos = texto.replace(/\D/g, "");
  if (texto.startsWith("00")) digitos = digitos.slice(2);
  if (!digitos) return null;

  const brasileiro = (nacional: string) => {
    // Zero de operadora na frente do DDD: 016 99234-0000, 0xx16...
    const semZero = nacional.replace(/^0+/, "");
    if (semZero.length === 11 && semZero[2] === "9") return `+55${semZero}`;
    if (semZero.length === 10) {
      const ddd = semZero.slice(0, 2);
      const numero = semZero.slice(2);
      return /^[6-9]/.test(numero) ? `+55${ddd}9${numero}` : `+55${ddd}${numero}`;
    }
    return null;
  };

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return brasileiro(digitos.slice(2));
  }
  if (internacional) return digitos.length >= 8 && digitos.length <= 15 ? `+${digitos}` : null;
  return brasileiro(digitos);
}

/** Só os dígitos: a chave para casar com o que já está na base, em qualquer formato. */
export function phoneKey(phone: string | null | undefined) {
  const normalizado = normalizePhone(phone);
  return normalizado ? normalizado.slice(1) : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase().replace(/^mailto:/, "") ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Planilha brasileira exportada do Excel vem com ponto e vírgula. */
function detectDelimiter(firstLine: string) {
  const conta = (sep: string) => firstLine.split(sep).length;
  const candidatos = [";", ",", "\t"];
  return candidatos.reduce((melhor, sep) => (conta(sep) > conta(melhor) ? sep : melhor), ",");
}

export function parseCsv(text: string): string[][] {
  const conteudo = text.replace(/^﻿/, "");
  const delimitador = detectDelimiter(conteudo.split(/\r?\n/, 1)[0] ?? "");
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (entreAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') entreAspas = false;
      else campo += c;
      continue;
    }
    if (c === '"' && campo === "") entreAspas = true;
    else if (c === delimitador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && conteudo[i + 1] === "\n") i += 1;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((campos) => campos.some((valor) => valor.trim() !== ""));
}

const VCARD_COLUMNS = ["Nome", "Telefone", "E-mail", "Empresa", "Etiquetas"];

function decodeVcardValue(valor: string, parametros: string) {
  let texto = valor;
  if (/ENCODING=QUOTED-PRINTABLE/i.test(parametros)) {
    const bytes = texto.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    texto = Buffer.from(bytes, "latin1").toString("utf8");
  }
  return texto.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** vCard 2.1, 3.0 e 4.0: o que o Google Contatos, o iPhone e o Android exportam. */
export function parseVcard(text: string): string[][] {
  // Linha que começa com espaço continua a anterior (dobra de linha do padrão).
  const desdobrado = text.replace(/^﻿/, "").replace(/\r?\n[ \t]/g, "");
  const cartoes: string[][] = [];
  let atual: { fn: string; n: string; phones: string[]; emails: string[]; org: string; categories: string } | null = null;

  for (const bruta of desdobrado.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (/^BEGIN:VCARD$/i.test(linha)) {
      atual = { fn: "", n: "", phones: [], emails: [], org: "", categories: "" };
      continue;
    }
    if (!atual) continue;
    if (/^END:VCARD$/i.test(linha)) {
      const nome = atual.fn || atual.n.split(";").slice(0, 2).reverse().join(" ").trim();
      cartoes.push([nome, atual.phones[0] ?? "", atual.emails[0] ?? "", atual.org, atual.categories]);
      atual = null;
      continue;
    }
    const separador = linha.indexOf(":");
    if (separador < 0) continue;
    const cabeca = linha.slice(0, separador);
    // "item1.TEL;TYPE=CELL" (iPhone) e "TEL;CELL" (2.1) são o mesmo campo.
    const [nomeCampo, ...resto] = cabeca.replace(/^[^.;:]+\./, "").split(";");
    const valor = decodeVcardValue(linha.slice(separador + 1), resto.join(";"));
    switch (nomeCampo.toUpperCase()) {
      case "FN": atual.fn = valor; break;
      case "N": atual.n = valor; break;
      case "TEL": if (valor) atual.phones.push(valor.replace(/^tel:/i, "")); break;
      case "EMAIL": if (valor) atual.emails.push(valor); break;
      case "ORG": atual.org = valor.split(";")[0]?.trim() ?? ""; break;
      case "CATEGORIES": atual.categories = valor; break;
      default: break;
    }
  }
  return cartoes;
}

export function parseContactFile(fileName: string, content: string): ParsedFile {
  if (/BEGIN:VCARD/i.test(content.slice(0, 2000)) || /\.vcf$/i.test(fileName)) {
    return { kind: "vcard", columns: VCARD_COLUMNS, rows: parseVcard(content) };
  }
  const [header = [], ...rows] = parseCsv(content);
  return { kind: "csv", columns: header.map((coluna) => coluna.trim()), rows };
}

const SINONIMOS: Record<ImportField, string[]> = {
  name: ["nome", "name", "nome completo", "full name", "contato", "cliente", "razao social", "first name"],
  phone: ["telefone", "celular", "whatsapp", "phone", "fone", "tel", "mobile", "numero", "phone 1 - value", "telefone 1"],
  email: ["email", "e-mail", "e mail", "mail", "e-mail 1 - value", "email 1"],
  company: ["empresa", "company", "organizacao", "organization", "organization name", "organization 1 - name"],
  tags: ["etiquetas", "tags", "tag", "etiqueta", "grupos", "labels", "categorias"],
};

/** Colunas reconhecidas pelo nome. O que não for reconhecido a pessoa escolhe na tela. */
export function guessMapping(columns: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const nomes = columns.map(semAcento);
  for (const field of IMPORT_FIELDS) {
    let indice = nomes.findIndex((nome) => SINONIMOS[field].includes(nome));
    if (indice < 0) indice = nomes.findIndex((nome) => SINONIMOS[field].some((sinonimo) => nome.startsWith(sinonimo)));
    if (indice >= 0 && !Object.values(mapping).includes(indice)) mapping[field] = indice;
  }
  return mapping;
}

function splitTags(valor: string) {
  return [...new Set(valor.split(/[,;|]| ::: /).map((tag) => tag.trim().toLowerCase().replace(/^\* /, "")).filter((tag) => tag && tag.length <= 40))].slice(0, 10);
}

/**
 * Transforma as linhas em contatos e separa o que não dá para importar.
 *
 * Contato sem telefone e sem e-mail fica de fora: não há como falar com ele nem
 * como reconhecê-lo numa próxima importação. Repetido dentro do próprio arquivo
 * entra uma vez só, com as etiquetas somadas.
 */
export function buildEntries(file: ParsedFile, mapping: ImportMapping): { entries: ImportEntry[]; rejected: ImportRejection[]; repeatedInFile: number } {
  const entries: ImportEntry[] = [];
  const rejected: ImportRejection[] = [];
  const porChave = new Map<string, ImportEntry>();
  let repeatedInFile = 0;
  const primeiraLinha = file.kind === "csv" ? 2 : 1;

  file.rows.forEach((row, indice) => {
    const line = indice + primeiraLinha;
    const campo = (field: ImportField) => (mapping[field] === undefined ? "" : (row[mapping[field]] ?? "").trim());
    const raw = row.join(" | ").slice(0, 200);
    const telefoneBruto = campo("phone");
    const emailBruto = campo("email");
    const phone = normalizePhone(telefoneBruto);
    const email = normalizeEmail(emailBruto);

    if (!phone && !email) {
      const reason = telefoneBruto ? "Telefone inválido" : emailBruto ? "E-mail inválido" : "Sem telefone e sem e-mail";
      rejected.push({ line, reason, raw });
      return;
    }

    const tags = splitTags(campo("tags"));
    const chaves = [phone ? `t:${phone}` : null, email ? `e:${email}` : null].filter((chave): chave is string => Boolean(chave));
    const repetido = chaves.map((chave) => porChave.get(chave)).find(Boolean);
    if (repetido) {
      repeatedInFile += 1;
      repetido.tags = [...new Set([...repetido.tags, ...tags])].slice(0, 10);
      repetido.phone ??= phone;
      repetido.email ??= email;
      repetido.company ??= campo("company") || null;
      for (const chave of chaves) porChave.set(chave, repetido);
      return;
    }

    const entry: ImportEntry = {
      line,
      name: (campo("name") || email || phone || "").slice(0, 200),
      phone,
      email,
      company: campo("company").slice(0, 200) || null,
      tags,
    };
    entries.push(entry);
    for (const chave of chaves) porChave.set(chave, entry);
  });

  return { entries, rejected, repeatedInFile };
}

export const LEGAL_BASES = ["contrato", "consentimento", "legitimo_interesse"] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];
