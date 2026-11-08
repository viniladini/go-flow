import { expect, it } from "vitest";
import { checkPublicText } from "../../scripts/check-dashboard-build.mts";

it.each(["analytics-local.mts", "analytics-result.json", "data-audit.md", "data-audit.json"])("recusa artefato privado no output: %s", (name) => {
  expect(() => checkPublicText("output.js", "../../private/" + name)).toThrow();
});
it("permite schemas e cenários sintéticos sem confundi-los com registros originais", () => {
  expect(() => checkPublicText("output.js", 'skus.csv DEMO-FLOW-01 goflow-demo-v1')).not.toThrow();
});
