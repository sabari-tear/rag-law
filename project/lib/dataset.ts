import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export type LegalDoc = {
  id: string;
  act: string;
  section?: string;
  title?: string;
  text: string;
  source: string;
};

let cachedDocs: LegalDoc[] | null = null;

function safeString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function loadCsvIfExists(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return [];
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, unknown>[];
  return records;
}

export async function loadLegalDocs(): Promise<LegalDoc[]> {
  if (cachedDocs) return cachedDocs;

  const datasetDir = path.join(process.cwd(), "dataset");
  const docs: LegalDoc[] = [];

  if (!fs.existsSync(datasetDir)) {
    console.warn("[dataset] dataset/ folder not found at", datasetDir);
    cachedDocs = [];
    return cachedDocs;
  }

  // IPC
  const ipcPath = path.join(datasetDir, "ipc_sections.csv");
  for (const [index, row] of loadCsvIfExists(ipcPath).entries()) {
    const section = safeString(row["Section"]);
    const description = safeString(row["Description"]);
    const offense = safeString(row["Offense"]);
    const punishment = safeString(row["Punishment"]);

    const title = offense || description.slice(0, 120);
    const text = [
      `Act: Indian Penal Code (IPC)`,
      section && `Section ${section}${title ? ` - ${title}` : ""}`,
      description && "Description:",
      description,
      punishment && "Punishment:",
      punishment,
    ]
      .filter(Boolean)
      .join("\n\n");

    docs.push({
      id: `ipc_${section || index}`,
      act: "Indian Penal Code (IPC)",
      section: section || undefined,
      title: title || undefined,
      text,
      source: "ipc_sections.csv",
    });
  }

  // BNS
  const bnsPath = path.join(datasetDir, "bns_sections.csv");
  for (const [index, row] of loadCsvIfExists(bnsPath).entries()) {
    const chapter = safeString(row["Chapter"]);
    const chapterName = safeString(row["Chapter_name"]);
    const section = safeString(row["Section"]);
    const sectionName = safeString(row["Section _name"] || row["Section_name"]);
    const description = safeString(row["Description"]);

    const title = sectionName || description.slice(0, 120);
    const text = [
      "Act: Bharatiya Nyaya Sanhita (BNS)",
      (chapter || chapterName) && `Chapter ${chapter}: ${chapterName}`,
      section && `Section ${section}${title ? ` - ${title}` : ""}`,
      description && "Description:",
      description,
    ]
      .filter(Boolean)
      .join("\n\n");

    docs.push({
      id: `bns_${section || index}`,
      act: "Bharatiya Nyaya Sanhita (BNS)",
      section: section || undefined,
      title: title || undefined,
      text,
      source: "bns_sections.csv",
    });
  }

  // BSA
  const bsaPath = path.join(datasetDir, "bsa_sections.csv");
  for (const [index, row] of loadCsvIfExists(bsaPath).entries()) {
    const section = safeString(row["Section"] || row["section"]);
    const sectionName = safeString(row["Section _name"] || row["Section_name"] || row["section_name"]);
    const description = safeString(row["Description"] || row["description"]);
    const chapter = safeString(row["Chapter"] || row["chapter"]);

    const title = sectionName || description.slice(0, 120);
    const text = [
      "Act: Bharatiya Sakshya Adhiniyam (BSA)",
      chapter && `Chapter ${chapter}`,
      section && `Section ${section}${title ? ` - ${title}` : ""}`,
      description && "Description:",
      description,
    ]
      .filter(Boolean)
      .join("\n\n");

    docs.push({
      id: `bsa_${section || index}`,
      act: "Bharatiya Sakshya Adhiniyam (BSA)",
      section: section || undefined,
      title: title || undefined,
      text,
      source: "bsa_sections.csv",
    });
  }

  // CRPC
  const crpcPath = path.join(datasetDir, "crpc_sections.csv");
  for (const [index, row] of loadCsvIfExists(crpcPath).entries()) {
    const section = safeString(row["Section"] || row["section"]);
    const sectionName = safeString(row["Section _name"] || row["Section_name"] || row["section_name"]);
    const description = safeString(row["Description"] || row["description"]);
    const chapter = safeString(row["Chapter"] || row["chapter"]);

    const title = sectionName || description.slice(0, 120);
    const text = [
      "Act: Code of Criminal Procedure (CrPC)",
      chapter && `Chapter ${chapter}`,
      section && `Section ${section}${title ? ` - ${title}` : ""}`,
      description && "Description:",
      description,
    ]
      .filter(Boolean)
      .join("\n\n");

    docs.push({
      id: `crpc_${section || index}`,
      act: "Code of Criminal Procedure (CrPC)",
      section: section || undefined,
      title: title || undefined,
      text,
      source: "crpc_sections.csv",
    });
  }

  if (!docs.length) {
    console.warn("[dataset] No legal documents loaded from CSV files.");
  } else {
    console.log(`[dataset] Loaded ${docs.length} legal sections from dataset CSVs.`);
  }

  cachedDocs = docs;
  return cachedDocs;
}
