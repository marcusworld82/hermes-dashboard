export const leadResearchTemplate = {
  name: 'Lead research pilot', description: 'Estimate, human cost approval, discovery, Notion sync and evidence review. Nothing sends.', schedule: '',
  steps: [
    { title: 'Estimate the lead research cost', agent: 'rico', instructions: 'Run python3 -m leadresearch.cli pilot-plan from the configured lead-research project. This command is offline. Record the estimate. Do not discover, enrich, sync or send. Actual discovery uses /discovery current schema and pricing quote.', after: [] as number[] },
    { title: 'Human Gate: Marcus reviews the current cost', agent: 'rico', instructions: 'Marcus must review the current quote in /discovery. Acknowledging this card does not authorize spending. Only the explicit cap approval in /discovery authorizes a paid run, within the shared $0.50 daily cap.', after: [0], humanGate: true },
    { title: 'Human Gate: discover and build through the approved button', agent: 'rico', instructions: 'Marcus uses /discovery and explicitly approves its exact cost. Wait for discovery and build to finish. Paste its completed run ID in the gate result. Do not ask an agent to launch an Actor from this card.', after: [1], humanGate: true },
    { title: 'Human Gate: confirm Notion sync and cache refresh', agent: 'rico', instructions: 'Check the discovery run is complete, records are saved in the Notion master and visible in /leads. Paste the verified run ID and record counts. If Notion failed, leave blocked and use the run sync control. No message sends.', after: [2], humanGate: true },
    { title: 'Quinn checks evidence and the no-outreach rule', agent: 'quinn', instructions: 'Read the completed research records. Check source links, dated observed facts, stable identities, public contacts and drafts. Flag unsupported claims. Report the honest researched count and actual or unknown cost. Do not send or start any paid research.', after: [3] },
  ],
};
