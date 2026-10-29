import { Plugin } from "@opencode/plugin/tui";
import { TextRenderable, StyledText, fg } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Memory, projectKey } from "./memory.ts";

export default Plugin.define({
  id: "uranium.ui",
  setup(context) {
    // Koi remains a separate, existing plugin. Uranium never installs or replaces it.
    const status = context.ui.slot({ append: "home.footer.status", render: () => new TextRenderable(context.renderer, {
      id: "uranium-status", content: new StyledText([fg("#A8E000")("URANIUM · U92"), fg("#78856B")("   /memory · /uranium-plan · /uranium-resume")]),
    }) as unknown as JSX.Element });
    const commands = context.ui.slot({ append: "app", render: () => {
      context.keymap.layer(() => ({ mode: "global", commands: [{
        id: "uranium.memory", title: "Uranium memory", group: "Uranium", palette: true,
        slash: { name: "memory", arguments: true },
        async run(input) {
          const memory = new Memory(projectKey(context.data.location.default().directory));
          const route = context.ui.router.current(), session = route.type === "session" ? route.sessionID : "operator";
          try {
            const action = input?.trim() || await context.ui.dialog.select({ title: "Uranium memory", options: [
              { title: "Review project candidates", value: "review" }, { title: "Capture project knowledge", value: "capture" },
              { title: "Recall reviewed knowledge", value: "recall" }, { title: "Personal memory across projects", value: "user" },
            ] });
            if (!action) return;
            let scope = "project", operation = action;
            if (action === "user") {
              scope = "user";
              operation = await context.ui.dialog.select({ title: "Personal memory · available across your projects", options: [
                { title: "Review personal candidates", value: "review" }, { title: "Capture a personal preference", value: "capture" }, { title: "Recall personal knowledge", value: "recall" },
              ] }) ?? "";
            }
            if (operation === "capture" || operation === "recall") {
              const text = await context.ui.dialog.prompt({ title: operation === "capture" ? "Short durable summary · no credentials or transcripts" : "Recall query" });
              if (!text?.trim()) return;
              const result = await memory.call(operation, { scope, session, summary: text, query: text });
              await context.ui.dialog.alert({ title: operation === "capture" ? "Captured for review" : "Recall evidence", message: JSON.stringify(result, null, 2) });
            } else if (operation === "review") {
              const queue = await memory.call("review", { scope, session });
              if (!queue.cards?.length) { context.ui.toast.show({ message: "No pending memory candidates.", variant: "info" }); return; }
              const id = await context.ui.dialog.select({ title: "Pending memory · select to inspect", options: queue.cards.map((card: any) => ({ title: card.summary, value: card.candidate_id })) });
              const card = queue.cards.find((value: any) => value.candidate_id === id); if (!card) return;
              await context.ui.dialog.alert({ title: "Review exact memory candidate", message: JSON.stringify(card, null, 2) });
              const decision = await context.ui.dialog.select({ title: "Decision for this reviewed revision", options: [
                { title: "Leave pending", value: "pending" }, { title: "Approve for future recall", value: "approve" }, { title: "Reject", value: "reject" },
              ] });
              if (!decision || decision === "pending") return;
              await memory.call(decision, { scope, session, id, revision: card.review_revision });
              context.ui.toast.show({ message: decision === "approve" ? "Memory approved for recall." : "Candidate rejected.", variant: "info" });
            } else context.ui.toast.show({ message: "/memory: review, capture, recall or user", variant: "info" });
          } catch (error) { context.ui.toast.show({ title: "Uranium memory", message: String(error), variant: "error" }); }
        },
      }] }));
      return null;
    } });
    return () => { commands(); status(); };
  },
});
