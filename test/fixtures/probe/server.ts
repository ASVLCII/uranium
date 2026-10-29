import { Plugin, Provider, Model } from "@opencode/plugin";
import { writeFileSync } from "node:fs";

// Test fixture only. Registers a local dummy model and aborts before dispatch.
export default Plugin.define({ id: "uranium.test-probe", async setup(ctx) {
  const providerID = Provider.ID.make("uranium-probe"), modelID = Model.ID.make("context-probe");
  await ctx.provider.transform(editor => editor.add({
    info: { ...Provider.Info.empty(providerID), name: "Uranium local test probe", activation: "enabled", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: "http://127.0.0.1:1/v1" } },
    models: [{ ...Model.Info.default(providerID, modelID), name: "Context probe" }],
  }));
  await ctx.model.transform(editor => editor.default.set(providerID, modelID));
  await ctx.session.hook("title", event => { event.result = "Uranium context probe"; });
  await ctx.session.hook("context", event => {
    if (!process.env.URANIUM_PROBE_OUTPUT) throw new Error("Probe output not configured");
    writeFileSync(process.env.URANIUM_PROBE_OUTPUT, JSON.stringify({ system: event.system, model: event.model, blockedBeforeDispatch: true }, null, 2));
    throw new Error("Uranium test probe intentionally stops before model dispatch");
  });
} });
