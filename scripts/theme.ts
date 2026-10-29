import { migrateV1, parseThemeDocument, resolveThemeDocument } from "@opencode/theme/tui";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Generate the complete V2 token tree using OpenCode's own migration library.
// This preserves semantic error/diff colors instead of turning every token green.
const colors = {
  primary: "#A8E000", secondary: "#87B800", accent: "#C7FF00", error: "#EF8176", warning: "#D5B76A", success: "#A8E000", info: "#8EB9AA",
  text: "#E7EBDD", textMuted: "#929D87", selectedListItemText: "#10120E", background: "#10120E", backgroundPanel: "#171B14", backgroundElement: "#21271B", backgroundMenu: "#21271B",
  border: "#333D29", borderActive: "#87B800", borderSubtle: "#252D1F", diffAdded: "#A8E000", diffRemoved: "#EF8176", diffContext: "#929D87", diffHunkHeader: "#929D87", diffHighlightAdded: "#C7FF00", diffHighlightRemoved: "#F3A097", diffAddedBg: "#1B2912", diffRemovedBg: "#2D1D18", diffContextBg: "#10120E", diffLineNumber: "#738064", diffAddedLineNumberBg: "#1B2912", diffRemovedLineNumberBg: "#2D1D18",
  markdownText: "#E7EBDD", markdownHeading: "#C7FF00", markdownLink: "#A8E000", markdownLinkText: "#B4CC92", markdownCode: "#B4CC92", markdownBlockQuote: "#929D87", markdownEmph: "#E7EBDD", markdownStrong: "#E7EBDD", markdownHorizontalRule: "#333D29", markdownListItem: "#A8E000", markdownListEnumeration: "#A8E000", markdownImage: "#A8E000", markdownImageText: "#B4CC92", markdownCodeBlock: "#E7EBDD",
  syntaxComment: "#738064", syntaxKeyword: "#C7FF00", syntaxFunction: "#B4CC92", syntaxVariable: "#E7EBDD", syntaxString: "#A6C879", syntaxNumber: "#C7B884", syntaxType: "#8EB9AA", syntaxOperator: "#929D87", syntaxPunctuation: "#929D87",
} as const;
const document = migrateV1({ theme: colors });
const parsed = parseThemeDocument(document, "uranium");
resolveThemeDocument(parsed, "dark");
const output = resolve(process.argv[2] || "assets/uranium-theme.json");
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(document, null, 2) + "\n");
console.log(output);
